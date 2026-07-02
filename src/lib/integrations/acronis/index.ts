/**
 * Acronis Cyber Cloud connector (Partner / MSP API).
 *
 * Acronis exposes a REST API at the datacenter where the partner
 * tenant lives (e.g. https://us5-cloud.acronis.com). For seat
 * reconciliation USI cares about per-tenant usage:
 *
 *   GET  /api/2/tenants                              — list child tenants
 *   GET  /api/2/tenants/{id}/usages                  — current usage per
 *                                                      offering
 *   GET  /api/2/tenants/{id}/usages/historical       — month-over-month
 *
 * Auth: OAuth2 client_credentials. Generate an API client from
 *   My Account → API Clients → Create. Use the client_id /
 *   client_secret pair to mint short-lived bearer tokens via
 *   POST /api/2/idp/token.
 *
 * Config shape:
 *   {
 *     baseUrl:      "https://us5-cloud.acronis.com",   // partner DC
 *     clientId:     "<OAuth client id>",
 *     clientSecret: "<OAuth client secret>",
 *     tenantId:     "<partner-tenant uuid>"            // your MSP tenant
 *   }
 *
 * STATUS: scaffold only. The OAuth flow + endpoint calls are sketched
 * so the connector is ready to wire up once credentials exist.
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

const configSchema = z.object({
  baseUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  tenantId: z.string().min(1),
});

type AcronisToken = {
  access_token: string;
  expires_on: number;
};

type AcronisTenant = {
  id: string;
  name: string;
  customer_type?: string;
  kind?: string;
  enabled?: boolean;
};

type AcronisUsage = {
  /** "workload_protection", "advanced_backup_workstation", etc. */
  usage_name: string;
  /** Human label. */
  edition?: string;
  /** Current number of seats / workloads in use. */
  value: number;
  /** Per-seat overage cost when the offering exposes it. */
  unit_cost?: number;
};

export class AcronisConnector implements VendorConnector {
  readonly kind = "acronis_cyber_cloud" as const;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenantId: string;
  private cachedToken: AcronisToken | null = null;

  constructor(rawConfig: Record<string, unknown>) {
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) {
      throw new ConnectorConfigError(
        "Acronis credentials not configured. Set baseUrl, clientId, clientSecret, tenantId in the integration's settings.",
      );
    }
    this.baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
    this.clientId = parsed.data.clientId;
    this.clientSecret = parsed.data.clientSecret;
    this.tenantId = parsed.data.tenantId;
  }

  private async token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expires_on > now + 30) {
      return this.cachedToken.access_token;
    }
    const r = await fetch(`${this.baseUrl}/api/2/idp/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${this.clientId}:${this.clientSecret}`,
        ).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (r.status === 401 || r.status === 403) {
      throw new ConnectorAuthError(`Acronis auth rejected (${r.status})`);
    }
    if (!r.ok) throw new Error(`Acronis token endpoint → HTTP ${r.status}`);
    const j = (await r.json()) as AcronisToken;
    this.cachedToken = j;
    return j.access_token;
  }

  private async req<T>(pathName: string): Promise<T> {
    const r = await fetch(`${this.baseUrl}${pathName}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${await this.token()}`,
      },
    });
    if (r.status === 401 || r.status === 403) {
      throw new ConnectorAuthError(`Acronis ${pathName} → HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(`Acronis ${pathName} → HTTP ${r.status}`);
    return (await r.json()) as T;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.token();
      const tenants = await this.req<{ items: AcronisTenant[] }>(
        `/api/2/tenants?parent_id=${encodeURIComponent(this.tenantId)}`,
      );
      return {
        ok: true,
        message: `Connected — ${tenants.items?.length ?? 0} child tenants`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listSeats(): Promise<VendorSeatSnapshot[]> {
    const tenants = await this.req<{ items: AcronisTenant[] }>(
      `/api/2/tenants?parent_id=${encodeURIComponent(this.tenantId)}`,
    );
    const snapshots: VendorSeatSnapshot[] = [];
    for (const t of tenants.items ?? []) {
      if (t.enabled === false) continue;
      try {
        const u = await this.req<{ items: AcronisUsage[] }>(
          `/api/2/tenants/${t.id}/usages`,
        );
        for (const row of u.items ?? []) {
          if (!row.value || row.value <= 0) continue;
          snapshots.push({
            vendorClientIdentifier: t.id,
            vendorClientName: t.name,
            productSku: `acronis_${row.usage_name}`,
            productName: `Acronis ${row.edition ?? row.usage_name}`,
            seats: row.value,
            costPerSeatCents:
              row.unit_cost != null ? Math.round(row.unit_cost * 100) : null,
          });
        }
      } catch (err) {
        console.warn(`[acronis] tenant ${t.id} (${t.name}) usage failed:`, err);
      }
    }
    return snapshots;
  }
}

export const acronisConnectorFactory: VendorConnectorFactory = ({ config }) =>
  new AcronisConnector(config);
