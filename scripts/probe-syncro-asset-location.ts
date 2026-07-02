/**
 * Probe: what location-like fields exist on a Syncro asset?
 *
 *   pnpm exec tsx scripts/probe-syncro-asset-location.ts
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import pg from "pg";
import { isSyncroConfigured, listAssetsForCustomer } from "../src/lib/syncro";

async function main() {
  if (!isSyncroConfigured()) {
    console.error("Syncro not configured.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL!;
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const { rows } = await c.query<{ id: string; name: string; syncro_customer_id: string }>(
    `SELECT id, name, syncro_customer_id FROM clients
       WHERE syncro_customer_id IS NOT NULL ORDER BY name LIMIT 3`,
  );
  await c.end();

  for (const r of rows) {
    const cid = parseInt(r.syncro_customer_id, 10);
    if (Number.isNaN(cid)) continue;
    console.log(`\n=== ${r.name} (syncro #${cid}) ===`);
    try {
      const assets = await listAssetsForCustomer(cid);
      console.log(`  ${assets.length} asset(s)`);
      const sample = assets.slice(0, 2);
      for (const a of sample) {
        console.log(`\n  --- asset #${a.id} (${a.name ?? "no name"}) ---`);
        const keys = Object.keys(a as object).filter(
          (k) => !["properties", "rmm_machine", "asset_custom_field_values"].includes(k),
        );
        for (const k of keys) {
          const v = (a as Record<string, unknown>)[k];
          if (
            typeof v === "string" &&
            (k.toLowerCase().includes("location") ||
              k.toLowerCase().includes("address") ||
              k.toLowerCase().includes("site") ||
              k.toLowerCase().includes("city"))
          ) {
            console.log(`    ${k}: ${v}`);
          }
        }
        if (a.properties) {
          console.log(`    properties keys: ${Object.keys(a.properties).join(", ") || "(empty)"}`);
          for (const [k, v] of Object.entries(a.properties)) {
            if (
              k.toLowerCase().includes("location") ||
              k.toLowerCase().includes("site") ||
              k.toLowerCase().includes("building") ||
              k.toLowerCase().includes("office") ||
              k.toLowerCase().includes("address")
            ) {
              console.log(`      [property] ${k}: ${JSON.stringify(v)}`);
            }
          }
        }
        if (a.asset_custom_field_values) {
          console.log(
            `    asset_custom_field_values: ${a.asset_custom_field_values
              .map((f) => `${f.name}=${JSON.stringify(f.value)}`)
              .join(" | ")}`,
          );
        }
        // Probe top-level full shape for anything location-ish
        const allKeys = Object.keys(a as object);
        const interesting = allKeys.filter((k) =>
          /location|site|address|city|state|zip|building|office/i.test(k),
        );
        if (interesting.length > 0) {
          for (const k of interesting) {
            const v = (a as Record<string, unknown>)[k];
            console.log(`    top-level ${k}: ${JSON.stringify(v)}`);
          }
        }
      }
    } catch (e) {
      console.log(`  error: ${(e as Error).message}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
