/**
 * Probe: dump every custom field name we see across all Syncro customers
 * and their assets, with frequency. Helps us decide what's worth wiring
 * into TechOS.
 *
 *   pnpm exec tsx scripts/probe-syncro-custom-fields.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import {
  isSyncroConfigured,
  listAllCustomers,
  listAssetsForCustomer,
} from "../src/lib/syncro";

function bumpField(
  bag: Map<string, { count: number; sampleValues: Set<string> }>,
  key: string,
  value: unknown,
) {
  const cur = bag.get(key) ?? { count: 0, sampleValues: new Set<string>() };
  cur.count++;
  if (value !== null && value !== undefined && cur.sampleValues.size < 5) {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (s.length > 0 && s.length < 80) cur.sampleValues.add(s);
  }
  bag.set(key, cur);
}

async function main() {
  if (!isSyncroConfigured()) {
    console.error("Syncro not configured.");
    process.exit(1);
  }

  console.log("Loading customers…");
  const customers = await listAllCustomers();
  console.log(`  ${customers.length} customers\n`);

  // Customer-level field aggregation
  const customerProps = new Map<string, { count: number; sampleValues: Set<string> }>();
  const customerCcfv = new Map<string, { count: number; sampleValues: Set<string> }>();

  for (const c of customers) {
    if (c.properties) {
      for (const [k, v] of Object.entries(c.properties)) bumpField(customerProps, k, v);
    }
    if (Array.isArray(c.customer_custom_field_values)) {
      for (const f of c.customer_custom_field_values) {
        bumpField(customerCcfv, String(f.name), f.value);
      }
    }
  }

  // Asset-level field aggregation — only probe customers we've linked
  // (saves API quota). Sample one asset per customer.
  const assetProps = new Map<string, { count: number; sampleValues: Set<string> }>();
  const assetAcfv = new Map<string, { count: number; sampleValues: Set<string> }>();
  let assetsTotal = 0;

  for (const c of customers) {
    let assets;
    try {
      assets = await listAssetsForCustomer(c.id);
    } catch (e) {
      console.log(`  (skipping ${c.business_name ?? c.id}: ${(e as Error).message})`);
      continue;
    }
    assetsTotal += assets.length;
    for (const a of assets) {
      if (a.properties) {
        for (const [k, v] of Object.entries(a.properties)) bumpField(assetProps, k, v);
      }
      if (Array.isArray(a.asset_custom_field_values)) {
        for (const f of a.asset_custom_field_values) {
          bumpField(assetAcfv, String(f.name), f.value);
        }
      }
    }
  }

  console.log(`\nProbed ${customers.length} customers + ${assetsTotal} assets.\n`);

  function dump(
    label: string,
    bag: Map<string, { count: number; sampleValues: Set<string> }>,
  ) {
    console.log(`\n=== ${label} (${bag.size} unique) ===`);
    const sorted = Array.from(bag.entries()).sort((a, b) => b[1].count - a[1].count);
    for (const [k, v] of sorted) {
      const samples = Array.from(v.sampleValues).slice(0, 3).join(" | ");
      console.log(`  ${String(v.count).padStart(4)}  ${k.padEnd(40)} ${samples ? "→ " + samples : ""}`);
    }
  }

  dump("CUSTOMER properties", customerProps);
  dump("CUSTOMER customer_custom_field_values", customerCcfv);
  dump("ASSET properties", assetProps);
  dump("ASSET asset_custom_field_values", assetAcfv);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
