/**
 * Bitdefender GravityZone connector.
 *
 * USI runs a SINGLE-TENANT (type: 0) GravityZone account, not an MSSP
 * Partner with child companies — `companies.getCompaniesList` is
 * unavailable in this configuration. Per-client breakdown has to be
 * hand-curated from the GZ UI (USI's "License Count" xlsx is the
 * current source of that data).
 *
 * What we CAN pull via the Public JSON-RPC API:
 *   • licensing.getMonthlyUsage(targetMonth='mm/yyyy')
 *       → per-product seat counts for the whole tenant (endpoint, EDR,
 *         MDR, ATS, encryption, mobile, exchange, container, etc.)
 *   • licensing.getLicenseInfo
 *       → current totalSlots / reservedSlots / usedSlots + expiry
 *   • companies.getCompanyDetails (no params)
 *       → the tenant's own identity (id + name)
 *
 * What we emit:
 *   • One vendor_seat_snapshot per non-zero usage metric, all under a
 *     single "vendor customer" = USI's own company id
 *   • SKU encoded as bd_<metric>, name pulled from BD_PRODUCT_LABEL
 *
 * Operator workflow:
 *   1. Test connection (hits getLicenseInfo)
 *   2. Sync now (writes one snapshot per non-zero product metric)
 *   3. Map "Universal Systems Inc." vendor customer to a TechOS client
 *      that represents USI itself — OR leave unmapped and treat the
 *      aggregate as "Bitdefender total billing".
 *
 * Future:
 *   • If USI moves to MSSP Partner tier, add getCompaniesList +
 *     per-company getMonthlyUsage loop (already sketched in repo
 *     history before this rewrite).
 *   • If USI sets up Custom Groups in GZ for per-client tracking,
 *     swap the strategy here to walk network.getEndpointsList per
 *     group.
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
  apiKey: z.string().min(1),
});

/**
 * Map each metric in licensing.getMonthlyUsage to a human label. The
 * key on the API response is `<metric>MonthlyUsage` — we strip the
 * suffix and use the lowercase prefix as the SKU.
 */
const BD_PRODUCT_LABEL: Record<string, string> = {
  endpoint: "Bitdefender Endpoint Security",
  encryption: "Bitdefender Full-Disk Encryption",
  emailSecurity: "Bitdefender Email Security",
  extendedEmailSecurity: "Bitdefender Extended Email Security",
  mobileSecurity: "Bitdefender Mobile Security",
  exchange: "Bitdefender Security for Exchange",
  ats: "Bitdefender Advanced Threat Security",
  edr: "Bitdefender EDR",
  phasr: "Bitdefender PHASR",
  easm: "Bitdefender EASM",
  edrStorage90Days: "Bitdefender EDR Storage (90 days)",
  edrStorage180Days: "Bitdefender EDR Storage (180 days)",
  edrStorage1Year: "Bitdefender EDR Storage (1 year)",
  mdrFoundations: "Bitdefender MDR Foundations",
  compliance: "Bitdefender Compliance Manager",
  patchManagement: "Bitdefender Patch Management",
  integrityMonitoring: "Bitdefender Integrity Monitoring",
  integrityMonitoring90Days: "Bitdefender Integrity Monitoring (90d storage)",
  integrityMonitoring180Days: "Bitdefender Integrity Monitoring (180d storage)",
  integrityMonitoring1Year: "Bitdefender Integrity Monitoring (1y storage)",
  sveVs: "Bitdefender SVE Virtual Servers",
  sveVdi: "Bitdefender SVE VDI",
  containerProtection: "Bitdefender Container Protection",
  xdrIdentitySensors: "Bitdefender XDR — Identity Sensors",
  xdrProductivitySensors: "Bitdefender XDR — Productivity Sensors",
  xdrNetworkSensors: "Bitdefender XDR — Network Sensors",
  xdrCloudSensors: "Bitdefender XDR — Cloud Sensors",
  aLaCarte: "Bitdefender — Total Monthly Usage",
  mspSecure: "Bitdefender MSP Secure",
  mspSecurePlus: "Bitdefender MSP Secure Plus",
  mspSecureExtra: "Bitdefender MSP Secure Extra",
};

type GetLicenseInfo = {
  isAddon?: boolean;
  expiryDate?: string;
  usedSlots?: number;
  reservedSlots?: number;
  totalSlots?: number;
};

type CompanyDetails = {
  id: string;
  name: string;
  type?: number;
};

type MonthlyUsage = Record<string, number>;

export class BitdefenderConnector implements VendorConnector {
  readonly kind = "bitdefender_gravityzone" as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(rawConfig: Record<string, unknown>) {
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) {
      throw new ConnectorConfigError(
        "Bitdefender GravityZone credentials not configured. Set baseUrl + apiKey in the integration's settings.",
      );
    }
    this.baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
    this.apiKey = parsed.data.apiKey;
  }

  /** JSON-RPC call helper. Bitdefender wraps every call in this. */
  private async rpc<T>(
    endpoint: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1.0/jsonrpc/${endpoint}`;
    const body = {
      id: crypto.randomUUID(),
      jsonrpc: "2.0",
      method,
      params,
    };
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });
    if (r.status === 401 || r.status === 403) {
      throw new ConnectorAuthError(
        `Bitdefender auth rejected (${r.status}) on ${endpoint}.${method}`,
      );
    }
    if (!r.ok) {
      throw new Error(`Bitdefender ${endpoint}.${method} → HTTP ${r.status}`);
    }
    const j = (await r.json()) as { result?: T; error?: { message: string } };
    if (j.error) {
      throw new Error(
        `Bitdefender ${endpoint}.${method} → ${j.error.message}`,
      );
    }
    return j.result as T;
  }

  /**
   * Light-weight credential check. Hits licensing.getLicenseInfo which
   * exists on every Bitdefender tenant (single + MSSP). Confirms the
   * key works AND that the Licensing API scope is enabled.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const lic = await this.rpc<GetLicenseInfo>(
        "licensing",
        "getLicenseInfo",
      );
      const used = lic.usedSlots ?? 0;
      const total = lic.totalSlots ?? 0;
      return {
        ok: true,
        message: `Connected — ${used.toLocaleString()} used / ${total.toLocaleString()} total slots`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Pull monthly usage for the most-recent CLOSED month and emit one
   * snapshot per non-zero product metric. We deliberately pick last
   * month (not the current in-progress one) so the data is settled.
   */
  async listSeats(): Promise<VendorSeatSnapshot[]> {
    // 1. Identify the tenant — gives us a stable vendorClientIdentifier
    //    so re-runs collide on the same snapshot grouping.
    const company = await this.rpc<CompanyDetails>(
      "companies",
      "getCompanyDetails",
      {},
    );

    // 2. Pull last month's usage in Bitdefender's mm/yyyy format.
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetMonth = `${String(lastMonth.getMonth() + 1).padStart(2, "0")}/${lastMonth.getFullYear()}`;
    const periodStart = new Date(
      Date.UTC(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0),
    );

    const usage = await this.rpc<MonthlyUsage>(
      "licensing",
      "getMonthlyUsage",
      { targetMonth },
    );

    // 3. One snapshot per metric with seats > 0.
    const snapshots: VendorSeatSnapshot[] = [];
    for (const [key, val] of Object.entries(usage ?? {})) {
      if (typeof val !== "number" || val <= 0) continue;
      const metric = key.replace(/MonthlyUsage$|Usage$/, "");
      const label = BD_PRODUCT_LABEL[metric] ?? `Bitdefender ${metric}`;
      // Skip the synthetic aLaCarte total when individual metrics also
      // exist — we already emit each product separately. Keep it when
      // we'd otherwise emit nothing useful.
      if (metric === "aLaCarte" && Object.keys(usage).length > 1) continue;
      snapshots.push({
        vendorClientIdentifier: company.id,
        vendorClientName: company.name,
        productSku: `bd_${metric}`,
        productName: label,
        seats: val,
        periodStart,
        periodEnd,
      });
    }
    return snapshots;
  }
}

export const bitdefenderConnectorFactory: VendorConnectorFactory = ({
  config,
}) => new BitdefenderConnector(config);
