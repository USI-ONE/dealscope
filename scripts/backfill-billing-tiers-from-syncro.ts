/**
 * One-shot: re-derive billing_tier from Syncro for every Syncro-linked
 * hardware row. Syncro is the source of truth.
 *
 * Precedence:
 *   1. Kiosk custom field = "1"       → kiosk_node
 *   2. form_factor includes "virtual"  → virtual_machine_node
 *   3. kind is mobile-class            → managed_mobile_device
 *   4. kind is compute-class           → full_compute_node
 *   5. otherwise                       → not_billable
 *
 *   pnpm exec tsx scripts/backfill-billing-tiers-from-syncro.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import pg from "pg";
import {
  extractAssetField,
  isSyncroConfigured,
  listAssetsForCustomer,
  type SyncroAsset,
} from "../src/lib/syncro";

type Kind =
  | "server"
  | "workstation"
  | "laptop"
  | "firewall"
  | "switch"
  | "ap"
  | "printer"
  | "phone"
  | "mobile"
  | "tablet"
  | "appliance"
  | "other";

/**
 * Mirror of src/server/actions/syncro.ts:guessKind — keep in lockstep.
 */
function guessKind(a: SyncroAsset): Kind {
  const ff = (
    (a.properties?.form_factor as string | undefined) ?? ""
  ).toLowerCase();
  if (ff) {
    if (ff.includes("server")) return "server";
    if (ff.includes("desktop") || ff.includes("workstation")) return "workstation";
    if (ff.includes("laptop") || ff.includes("notebook")) return "laptop";
    if (ff.includes("tablet")) return "tablet";
    if (ff.includes("phone") || ff.includes("mobile")) return "mobile";
  }
  const raw = (a.asset_type ?? "").toLowerCase();
  if (!raw) return ff ? "workstation" : "other";
  if (raw.includes("server")) return "server";
  if (raw.includes("desktop") || raw.includes("workstation")) return "workstation";
  if (raw.includes("laptop") || raw.includes("notebook")) return "laptop";
  if (raw.includes("firewall") || raw.includes("router") || raw.includes("gateway"))
    return "firewall";
  if (raw.includes("switch")) return "switch";
  if (raw.includes("access point") || raw.includes(" ap ") || raw.endsWith(" ap"))
    return "ap";
  if (raw.includes("printer")) return "printer";
  if (raw.includes("phone") && !raw.includes("mobile")) return "phone";
  if (raw.includes("mobile") || raw.includes("iphone") || raw.includes("android"))
    return "mobile";
  if (raw.includes("tablet") || raw.includes("ipad")) return "tablet";
  return "other";
}

function deriveBillingTier(a: SyncroAsset, kind: Kind): string {
  const isKiosk = extractAssetField(a, "Kiosk");
  if (isKiosk === "1") return "kiosk_node";
  const ff = ((a.properties?.form_factor as string | undefined) ?? "")
    .toLowerCase();
  if (ff.includes("virtual")) return "virtual_machine_node";
  if (kind === "mobile" || kind === "tablet" || kind === "phone") {
    return "managed_mobile_device";
  }
  if (kind === "server" || kind === "workstation" || kind === "laptop") {
    return "full_compute_node";
  }
  return "not_billable";
}

async function main() {
  if (!isSyncroConfigured()) {
    console.error("Syncro not configured.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL!;
  const c = new pg.Client({ connectionString: url });
  await c.connect();

  const { rows: clients } = await c.query<{
    id: string;
    name: string;
    syncro_customer_id: string;
  }>(
    `SELECT id, name, syncro_customer_id
       FROM clients WHERE syncro_customer_id IS NOT NULL
      ORDER BY name`,
  );

  let totalChanged = 0;
  const tierTotals: Record<string, number> = {
    full_compute_node: 0,
    kiosk_node: 0,
    virtual_machine_node: 0,
    managed_mobile_device: 0,
    not_billable: 0,
  };
  for (const cli of clients) {
    const cid = parseInt(cli.syncro_customer_id, 10);
    if (Number.isNaN(cid)) continue;
    let assets;
    try {
      assets = await listAssetsForCustomer(cid);
    } catch (e) {
      console.log(`  ${cli.name}: pull failed — ${(e as Error).message}`);
      continue;
    }
    let changed = 0;
    const byTier: Record<string, number> = {};
    for (const a of assets) {
      // Re-derive BOTH kind and billing_tier from Syncro signals (the
      // previous import used asset_type only which always returned
      // "other" for these tenants — form_factor is the real signal).
      const row = await c.query<{ id: string; kind: Kind; billing_tier: string }>(
        `SELECT id, kind, billing_tier
           FROM hardware
          WHERE client_id = $1 AND syncro_asset_id = $2`,
        [cli.id, String(a.id)],
      );
      if (row.rows.length === 0) continue;
      const hw = row.rows[0];
      const nextKind = guessKind(a);
      const next = deriveBillingTier(a, nextKind);
      byTier[next] = (byTier[next] ?? 0) + 1;
      tierTotals[next]++;
      if (next !== hw.billing_tier || nextKind !== hw.kind) {
        await c.query(
          `UPDATE hardware
              SET billing_tier = $1, kind = $2, updated_at = NOW()
            WHERE id = $3`,
          [next, nextKind, hw.id],
        );
        changed++;
      }
    }
    totalChanged += changed;
    const tiersStr = Object.entries(byTier)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${t.replace("_node", "").replace("_", "")}=${n}`)
      .join(" ");
    console.log(
      `  ${cli.name.padEnd(38)} ${assets.length} assets, changed=${changed}  ${tiersStr}`,
    );
  }

  console.log(`\nTotal hardware rows updated: ${totalChanged}`);
  console.log("Org-wide tier totals (Syncro-linked devices):");
  for (const [t, n] of Object.entries(tierTotals)) {
    if (n > 0) console.log(`  ${t.padEnd(24)} ${n}`);
  }
  await c.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
