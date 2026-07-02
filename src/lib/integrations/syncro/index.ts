/**
 * Syncro connector — thin adapter over the existing src/lib/syncro.ts
 * client so Syncro participates in the multi-vendor architecture
 * (integrations dashboard, reconciliation report, etc.) alongside
 * Liongard / Bitdefender / etc.
 *
 * For seat counts we expose three SKUs per customer:
 *
 *   syncro_managed_endpoint  — non-kiosk, on-contract assets
 *   syncro_kiosk_endpoint    — kiosk-flagged assets
 *   syncro_remote_contact    — portal_users (active = not disabled).
 *                              Drives the "Syncro Remote Access -
 *                              per contact" line on the PS invoice.
 *                              See lib/syncro.ts SyncroPortalUser
 *                              for the caveat about Splashtop vs.
 *                              ticket-only portal groups — the count
 *                              here is a "candidate" the operator
 *                              reviews before billing.
 *
 * Config shape (configJson): empty for now — Syncro creds still come
 * from SYNCRO_SUBDOMAIN / SYNCRO_API_KEY env vars to match the legacy
 * client. We'll migrate them to configJson on the next pass.
 */
import {
  extractAssetField,
  listAllCustomers,
  listAllPortalUsers,
  listAssetsForCustomer,
  testConnection as syncroTestConnection,
  type SyncroAsset,
} from "@/lib/syncro";
import {
  ConnectorConfigError,
  type ConnectionTestResult,
  type VendorConnector,
  type VendorConnectorFactory,
  type VendorSeatSnapshot,
} from "../connector";

export class SyncroConnector implements VendorConnector {
  readonly kind = "syncro" as const;

  constructor(_config: Record<string, unknown>) {
    if (!process.env.SYNCRO_SUBDOMAIN || !process.env.SYNCRO_API_KEY) {
      throw new ConnectorConfigError(
        "SYNCRO_SUBDOMAIN and SYNCRO_API_KEY env vars must be set.",
      );
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const r = await syncroTestConnection();
      if (r.ok) {
        const count = r.sample.customerCount ?? "?";
        return { ok: true, message: `Connected — ${count} customers visible` };
      }
      return { ok: false, message: r.error };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listSeats(): Promise<VendorSeatSnapshot[]> {
    const customers = await listAllCustomers();
    const rows: VendorSeatSnapshot[] = [];
    const nameById = new Map<number, string>();
    for (const c of customers) {
      const name =
        c.business_then_name ?? c.business_name ?? `Syncro Customer ${c.id}`;
      nameById.set(c.id, name);
      const assets = await listAssetsForCustomer(c.id);
      const counts = countAssets(assets);
      if (counts.managed > 0) {
        rows.push({
          vendorClientIdentifier: String(c.id),
          vendorClientName: name,
          productSku: "syncro_managed_endpoint",
          productName: "Syncro Managed Endpoint",
          seats: counts.managed,
        });
      }
      if (counts.kiosk > 0) {
        rows.push({
          vendorClientIdentifier: String(c.id),
          vendorClientName: name,
          productSku: "syncro_kiosk_endpoint",
          productName: "Syncro Kiosk Endpoint",
          seats: counts.kiosk,
        });
      }
    }

    // One pass for portal users — total per customer, only active
    // (disabled=false) ones counted as billable Remote Access seats.
    const portalUsers = await listAllPortalUsers();
    const portalByCust = new Map<number, number>();
    for (const u of portalUsers) {
      if (u.disabled) continue;
      portalByCust.set(u.customer_id, (portalByCust.get(u.customer_id) ?? 0) + 1);
    }
    for (const [custId, count] of portalByCust.entries()) {
      if (count <= 0) continue;
      rows.push({
        vendorClientIdentifier: String(custId),
        vendorClientName: nameById.get(custId) ?? `Syncro Customer ${custId}`,
        productSku: "syncro_remote_contact",
        productName: "Syncro Remote Access — per contact (portal user)",
        seats: count,
      });
    }

    return rows;
  }
}

/**
 * Count Syncro assets per billing-relevant bucket. Mirrors the rules
 * already used in the existing Syncro sync:
 *   • NotOnContract = "1" → excluded entirely (no charge)
 *   • Kiosk = "1"        → kiosk bucket
 *   • everything else    → managed bucket
 */
function countAssets(assets: SyncroAsset[]): {
  managed: number;
  kiosk: number;
} {
  let managed = 0;
  let kiosk = 0;
  for (const a of assets) {
    const notOnContract = extractAssetField(a, "Not on Contract");
    if (notOnContract === "1") {
      continue;
    }
    const isKiosk = extractAssetField(a, "Kiosk");
    if (isKiosk === "1") {
      kiosk++;
    } else {
      managed++;
    }
  }
  return { managed, kiosk };
}

export const syncroConnectorFactory: VendorConnectorFactory = ({ config }) =>
  new SyncroConnector(config);
