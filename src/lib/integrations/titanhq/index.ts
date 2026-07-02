/**
 * TitanHQ connector — covers both SpamTitan Cloud (email security) and
 * WebTitan Cloud (DNS filtering). TitanHQ ships separate API hosts per
 * product but the auth + shape is similar.
 *
 * Required endpoints:
 *
 *   GET  /api/v1/customers              — list MSP-managed customers
 *   GET  /api/v1/customers/{id}/domains — domains attached to that customer
 *   GET  /api/v1/customers/{id}/mailbox-summary
 *                                       — current mailbox count (Spam)
 *                                         or seat count (Web)
 *
 * (Endpoint names may differ slightly per product — TitanHQ's docs are
 * gated behind partner login. The structure here is the shape we
 * expect; tighten when wiring credentials.)
 *
 * Auth: API key in `X-Api-Key` header. Issued from the MSP portal →
 * Settings → API.
 *
 * Config shape:
 *   {
 *     product: "spamtitan" | "webtitan",
 *     baseUrl: "https://api.spamtitancloud.com",
 *     apiKey:  "<from MSP portal>"
 *   }
 *
 * STATUS: scaffold only. Mark fields private + listSeats throws
 * ConnectorConfigError until credentials are dropped in.
 */
import { z } from "zod";
import {
  ConnectorAuthError,
  ConnectorConfigError,
  type ConnectionTestResult,
  type VendorConnector,
  type VendorConnectorFactory,
  type VendorSeatSnapshot,
} from "../connector";

/**
 * Two modes supported:
 *
 *   1. "api" — full API integration (per-tenant mailbox counts pulled
 *      via the SpamTitan / WebTitan REST API). Requires baseUrl +
 *      apiKey + product.
 *
 *   2. "csv_ingest" — operator uploads the monthly License Usage
 *      report from platform.titanhq.com/msp manually. No API access
 *      required. listSeats() returns an empty array so the daily
 *      cron is a no-op; the real data ingest happens in the
 *      /api/integrations/titanhq/ingest-csv route.
 *
 * TitanHQ Platform MSP portal doesn't expose API access self-serve, so
 * USI is currently on mode="csv_ingest". When TitanHQ provisions API
 * credentials (request open with their support team), switch the
 * connection's config_json to mode="api" + fill in baseUrl/apiKey.
 */
const apiConfigSchema = z.object({
  mode: z.literal("api").optional(),
  product: z.enum(["spamtitan", "webtitan"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
});

const csvIngestConfigSchema = z.object({
  mode: z.literal("csv_ingest"),
});

const configSchema = z.union([apiConfigSchema, csvIngestConfigSchema]);

type TitanCustomer = { id: string; name: string };
type TitanMailboxSummary = { customerId: string; mailboxCount: number };

export class TitanHQConnector implements VendorConnector {
  readonly kind = "titanhq" as const;
  private readonly mode: "api" | "csv_ingest";
  private readonly product: "spamtitan" | "webtitan" | null = null;
  private readonly baseUrl: string | null = null;
  private readonly apiKey: string | null = null;

  constructor(rawConfig: Record<string, unknown>) {
    // CSV-ingest mode: connection holds no credentials. listSeats is a
    // no-op (data comes from the /ingest-csv route). testConnection
    // reports the mode honestly so the dashboard doesn't lie.
    if (rawConfig && rawConfig.mode === "csv_ingest") {
      this.mode = "csv_ingest";
      return;
    }
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) {
      throw new ConnectorConfigError(
        "TitanHQ not configured. Either set mode='csv_ingest' for manual uploads, or provide product+baseUrl+apiKey for live API access.",
      );
    }
    if ("apiKey" in parsed.data) {
      this.mode = "api";
      this.product = parsed.data.product;
      this.baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
      this.apiKey = parsed.data.apiKey;
    } else {
      this.mode = "csv_ingest";
    }
  }

  private async req<T>(pathName: string): Promise<T> {
    if (!this.baseUrl || !this.apiKey) {
      throw new ConnectorConfigError(
        "TitanHQ connector is in CSV-ingest mode — no API base URL/key set.",
      );
    }
    const r = await fetch(`${this.baseUrl}${pathName}`, {
      headers: {
        Accept: "application/json",
        "X-Api-Key": this.apiKey,
      },
    });
    if (r.status === 401 || r.status === 403) {
      throw new ConnectorAuthError(`TitanHQ ${pathName} → HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(`TitanHQ ${pathName} → HTTP ${r.status}`);
    return (await r.json()) as T;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (this.mode === "csv_ingest") {
      return {
        ok: true,
        message:
          "CSV-ingest mode — TitanHQ Platform doesn't expose self-serve API. Upload monthly reports via the CSV uploader.",
      };
    }
    try {
      const customers = await this.req<{ items: TitanCustomer[] }>(
        "/api/v1/customers",
      );
      return {
        ok: true,
        message: `Connected (${this.product}) — ${customers.items?.length ?? 0} customers`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listSeats(): Promise<VendorSeatSnapshot[]> {
    if (this.mode === "csv_ingest") {
      // No-op: data is populated by the /ingest-csv route, not the
      // daily cron. Returning empty preserves existing snapshots
      // (the sync runner inserts new ones, doesn't delete).
      return [];
    }
    const customers = await this.req<{ items: TitanCustomer[] }>(
      "/api/v1/customers",
    );
    const snapshots: VendorSeatSnapshot[] = [];
    for (const c of customers.items ?? []) {
      try {
        const summary = await this.req<TitanMailboxSummary>(
          `/api/v1/customers/${c.id}/mailbox-summary`,
        );
        if (summary.mailboxCount > 0) {
          snapshots.push({
            vendorClientIdentifier: c.id,
            vendorClientName: c.name,
            productSku: `titanhq_${this.product}_mailbox`,
            productName:
              this.product === "spamtitan"
                ? "TitanHQ SpamTitan — Mailbox"
                : "TitanHQ WebTitan — Seat",
            seats: summary.mailboxCount,
          });
        }
      } catch (err) {
        console.warn(`[titanhq] customer ${c.id} (${c.name}) failed:`, err);
      }
    }
    return snapshots;
  }
}

export const titanhqConnectorFactory: VendorConnectorFactory = ({ config }) =>
  new TitanHQConnector(config);
