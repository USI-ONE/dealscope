/**
 * Ingram Micro Cloud Marketplace connector.
 *
 * Ingram is USI's CSP (Cloud Solution Provider) distributor for
 * Microsoft 365 — every M365 subscription USI resells to its clients
 * is purchased through Ingram. Ingram's API is the authoritative
 * source for:
 *
 *   • Per-customer M365 subscription list (SKU + seat counts)
 *   • Monthly billing reconciliation (what Ingram charges USI)
 *   • Renewal dates + auto-renew posture
 *
 * Auth flow
 * ─────────
 * OAuth 2.0 client_credentials grant against
 *   POST https://api.ingrammicro.com/oauth/oauth20/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&client_id=…&client_secret=…
 *
 * Returns:
 *   { access_token, token_type: "Bearer", expires_in: 86400 }
 *
 * Tokens last 24h — we cache in-process and only renew when within
 * 60s of expiry. The connector is short-lived per cron run anyway,
 * so we typically only fetch one token per sync.
 *
 * API surface
 * ───────────
 * Probed during development (see commit message). Existing endpoints:
 *
 *   GET  /resellers/v6/subscriptions/microsoft   ← M365 per-customer subscriptions
 *   GET  /resellers/v6/subscriptions             ← all CSP subscriptions
 *   GET  /resellers/v6/orders                    ← reseller orders
 *   GET  /resellers/v6/invoices                  ← Ingram invoices (= USI's cost)
 *   GET  /resellers/v6/renewals                  ← upcoming renewals
 *
 * Required headers (every call):
 *   Authorization:        Bearer <token>
 *   IM-CustomerNumber:    <USI's Ingram customer #, from the API key prefix>
 *   IM-CorrelationID:     <any UUID for tracing — generated per request>
 *   IM-CountryCode:       US
 *
 * "In Review" credentials return HTTP 401 with body
 *   { "fault": { "faultstring": "Invalid API call as no apiproduct match found" } }
 * on every endpoint. The OAuth token endpoint works fine — the gate is
 * Apigee's product mapping, which Ingram flips on at approval. The
 * connector reports this distinctly so the dashboard surfaces "review
 * pending" vs. a real auth failure.
 *
 * Config shape (configJson):
 *   {
 *     clientId:        "<from CEP → App API Keys>",
 *     clientSecret:    "<shown once on app creation>",
 *     customerNumber:  "<USI's Ingram customer #, e.g. 466870>"
 *   }
 */
import { randomUUID, createHash } from "crypto";
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
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  customerNumber: z.string().min(1),
});

const TOKEN_URL = "https://api.ingrammicro.com/oauth/oauth20/token";
const API_BASE = "https://api.ingrammicro.com";

type IngramSubscription = {
  subscriptionId?: string;
  customer?: {
    customerNumber?: string;
    companyName?: string;
    name?: string;
  };
  customerNumber?: string;
  customerName?: string;
  vendor?: string;
  sku?: string;
  partNumber?: string;
  description?: string;
  quantity?: number;
  seats?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  billingCycle?: string;
  pricePerUnit?: number;
  unitPrice?: { amount?: number; currency?: string };
};

type CachedToken = { accessToken: string; expiresAt: number };

/**
 * Header-level Ingram invoice as returned by /resellers/v6/invoices.
 * The endpoint is paginated and shape-stable; line items require a
 * second call to /invoices/{id} which we defer until v2.
 */
export type IngramInvoiceHeader = {
  invoiceNumber: string;
  ingramOrderNumber?: string | null;
  customerOrderNumber?: string | null;
  invoiceDate?: string | null;
  invoiceDueDate?: string | null;
  orderCreateDate?: string | null;
  invoiceStatus?: string | null;
  invoiceType?: string | null;
  purchaseType?: string | null;
  invoiceAmountInclTax?: number | null;
  invoicedAmountDue?: number | null;
  invoicedAmountPaid?: number | null;
  currencyCode?: string | null;
  specialBidNumbers?: string[] | null;
};

export class IngramMicroConnector implements VendorConnector {
  readonly kind = "ingram_micro" as const;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly customerNumber: string;
  private cachedToken: CachedToken | null = null;

  constructor(rawConfig: Record<string, unknown>) {
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) {
      throw new ConnectorConfigError(
        "Ingram Micro credentials not configured. Need clientId, clientSecret, customerNumber.",
      );
    }
    this.clientId = parsed.data.clientId;
    this.clientSecret = parsed.data.clientSecret;
    this.customerNumber = parsed.data.customerNumber;
  }

  /**
   * Mint or reuse an OAuth bearer token. Cached for the lifetime of
   * this connector instance (a few seconds during a sync — this is
   * defensive against multiple calls in a single listSeats pass).
   */
  private async token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60) {
      return this.cachedToken.accessToken;
    }
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}`,
    });
    if (r.status === 401 || r.status === 403) {
      throw new ConnectorAuthError(
        `Ingram OAuth rejected (${r.status}) — credentials invalid or revoked`,
      );
    }
    if (!r.ok) {
      throw new Error(`Ingram OAuth → HTTP ${r.status}`);
    }
    const j = (await r.json()) as {
      access_token?: string;
      expires_in?: string | number;
    };
    if (!j.access_token) throw new Error("Ingram OAuth response missing access_token");
    const ttl =
      typeof j.expires_in === "string"
        ? parseInt(j.expires_in, 10)
        : j.expires_in ?? 3600;
    this.cachedToken = {
      accessToken: j.access_token,
      expiresAt: now + ttl,
    };
    return j.access_token;
  }

  private async req<T>(pathName: string): Promise<T> {
    const token = await this.token();
    const r = await fetch(`${API_BASE}${pathName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "IM-CustomerNumber": this.customerNumber,
        "IM-CorrelationID": randomUUID(),
        "IM-CountryCode": "US",
      },
    });
    if (r.status === 401) {
      const body = await r.text().catch(() => "");
      // Apigee 401 with "no apiproduct match" = credentials are still
      // pending review. Surface that distinctly so the operator knows
      // it's not a real auth issue.
      if (/no apiproduct match/i.test(body)) {
        throw new ConnectorAuthError(
          `Ingram credentials pending review approval — Apigee returned 'no apiproduct match'. The OAuth token works, but the app needs to be moved to Production in CEP before TechOS can call ${pathName}.`,
        );
      }
      throw new ConnectorAuthError(
        `Ingram ${pathName} auth rejected (401): ${body.slice(0, 200)}`,
      );
    }
    if (r.status === 403) {
      const body = await r.text().catch(() => "");
      throw new ConnectorAuthError(
        `Ingram ${pathName} forbidden (403): ${body.slice(0, 200)}`,
      );
    }
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Ingram ${pathName} → HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    return (await r.json()) as T;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // Ingram has two separate API product bindings on the same OAuth
    // domain — Reseller API (orders/invoices/customers/quotes) and
    // Cloud Marketplace Platform (M365 subscriptions). Each is gated
    // by a separate Apigee approval, so we test both and report which
    // are live. /resellers/v6/invoices is the Reseller API canary;
    // /resellers/v6/subscriptions/microsoft is the CMP canary.
    let resellerOk = false;
    let resellerCount = 0;
    let resellerMsg = "";
    try {
      const r = await this.req<{ recordsFound?: number }>(
        "/resellers/v6/invoices?pageSize=1",
      );
      resellerOk = true;
      resellerCount = r.recordsFound ?? 0;
    } catch (err) {
      resellerMsg = err instanceof Error ? err.message : String(err);
    }

    let cmpOk = false;
    let cmpCount = 0;
    let cmpMsg = "";
    try {
      const r = await this.req<{
        subscriptions?: IngramSubscription[];
        recordsFound?: number;
      }>("/resellers/v6/subscriptions/microsoft?pageSize=1");
      cmpOk = true;
      cmpCount = r.recordsFound ?? r.subscriptions?.length ?? 0;
    } catch (err) {
      cmpMsg = err instanceof Error ? err.message : String(err);
    }

    if (resellerOk && cmpOk) {
      return {
        ok: true,
        message: `Connected — Reseller API (${resellerCount} invoices) + CMP M365 (${cmpCount} subs)`,
      };
    }
    if (resellerOk) {
      const cmpHint = /no apiproduct match/i.test(cmpMsg)
        ? "CMP/M365 still pending separate Apigee approval"
        : `CMP/M365 check failed: ${cmpMsg.slice(0, 100)}`;
      return {
        ok: true,
        message: `Reseller API live — ${resellerCount} invoices visible. ${cmpHint}.`,
      };
    }
    if (cmpOk) {
      return {
        ok: true,
        message: `CMP M365 live — ${cmpCount} subscriptions. Reseller API check failed: ${resellerMsg.slice(0, 100)}`,
      };
    }
    return {
      ok: false,
      message:
        /no apiproduct match/i.test(resellerMsg + cmpMsg)
          ? `Ingram approval still pending — Apigee 'no apiproduct match'. Confirm app is in Production in CEP.`
          : `Both Reseller and CMP failed. Reseller: ${resellerMsg.slice(0, 120)}. CMP: ${cmpMsg.slice(0, 120)}`,
    };
  }

  /**
   * Pull every M365 subscription paginated, group by customer, emit
   * one snapshot per (customer × SKU). For now we focus on M365
   * because that's the bulk of what USI rebills through Ingram. We
   * can broaden to all-vendor /resellers/v6/subscriptions later.
   */
  async listSeats(): Promise<VendorSeatSnapshot[]> {
    const rows: VendorSeatSnapshot[] = [];
    let page = 1;
    const pageSize = 50;
    for (;;) {
      let data: {
        subscriptions?: IngramSubscription[];
        recordsFound?: number;
        nextPage?: string | null;
      };
      try {
        data = await this.req(
          `/resellers/v6/subscriptions/microsoft?pageSize=${pageSize}&page=${page}`,
        );
      } catch (err) {
        // CMP / M365 is a separate Apigee product approval from the
        // Reseller API. If only the Reseller side is approved, the
        // subscriptions endpoint still 401s with "no apiproduct match"
        // — that's not a connector failure, just CMP-pending. Return
        // empty so the cron run succeeds; the Reseller side carries
        // its own surface (invoices/orders) and is synced separately.
        const msg = err instanceof Error ? err.message : String(err);
        if (/no apiproduct match/i.test(msg)) return [];
        throw err;
      }
      const subs = data.subscriptions ?? [];
      for (const s of subs) {
        const customerId =
          s.customer?.customerNumber ?? s.customerNumber ?? "unknown";
        const customerName =
          s.customer?.companyName ??
          s.customer?.name ??
          s.customerName ??
          `Ingram Customer ${customerId}`;
        const sku = s.sku ?? s.partNumber ?? "unknown_sku";
        const productName = s.description ?? sku;
        const seats = s.seats ?? s.quantity ?? 0;
        if (!seats || seats <= 0) continue;
        rows.push({
          vendorClientIdentifier: customerId,
          vendorClientName: customerName,
          productSku: `ingram_${sku}`,
          productName: `Microsoft 365 — ${productName}`,
          seats,
          costPerSeatCents:
            s.unitPrice?.amount != null
              ? Math.round(s.unitPrice.amount * 100)
              : s.pricePerUnit != null
                ? Math.round(s.pricePerUnit * 100)
                : null,
        });
      }
      if (subs.length < pageSize) break;
      page++;
      if (page > 100) break; // safety stop
    }
    return rows;
  }

  /**
   * Pull every invoice Ingram has issued to this reseller account.
   * Endpoint: /resellers/v6/invoices — header level, no line items.
   * Paginated; each page returns recordsFound + invoices[] + nextPage.
   *
   * Returns headers in API order (Ingram returns newest-first). The
   * sync layer is responsible for upsert + client attribution.
   */
  async listInvoices(opts?: {
    pageSize?: number;
    maxPages?: number;
  }): Promise<IngramInvoiceHeader[]> {
    const pageSize = opts?.pageSize ?? 100;
    const maxPages = opts?.maxPages ?? 200; // 200 × 100 = 20k cap
    const out: IngramInvoiceHeader[] = [];
    let page = 1;
    for (;;) {
      const data = await this.req<{
        invoices?: IngramInvoiceHeader[];
        recordsFound?: number;
        nextPage?: string | null;
      }>(`/resellers/v6/invoices?pageSize=${pageSize}&pageNumber=${page}`);
      const list = data.invoices ?? [];
      out.push(...list);
      if (list.length < pageSize) break;
      page++;
      if (page > maxPages) break;
    }
    return out;
  }
}

export const ingramMicroConnectorFactory: VendorConnectorFactory = ({
  config,
}) => new IngramMicroConnector(config);
