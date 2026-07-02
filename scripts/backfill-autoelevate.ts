/**
 * One-shot: pull the "autoelevate running" custom field from every
 * Syncro-linked client and write it to clients.autoelevate_status.
 *
 *   pnpm exec tsx scripts/backfill-autoelevate.ts
 *
 * Idempotent — safe to re-run as values change in Syncro.
 *
 * Note: we use raw pg here (not the @/db helper) because the helper
 * throws at import time if DATABASE_URL isn't set, and our env-loading
 * order makes that flaky with tsx.
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import pg from "pg";
import {
  extractCustomerAutoelevate,
  extractCustomerLocation,
  getCustomer,
  isSyncroConfigured,
} from "../src/lib/syncro";

async function main() {
  if (!isSyncroConfigured()) {
    console.error("Syncro not configured. Set SYNCRO_SUBDOMAIN + SYNCRO_API_KEY.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const { rows } = await client.query<{
    id: string;
    name: string;
    syncro_customer_id: string | null;
    autoelevate_status: string | null;
    location: string | null;
  }>(
    `SELECT id, name, syncro_customer_id, autoelevate_status, location
       FROM clients
      WHERE syncro_customer_id IS NOT NULL
      ORDER BY name`,
  );

  console.log(`Found ${rows.length} Syncro-linked client(s). Probing…\n`);

  let changed = 0;
  let unchanged = 0;
  let errors = 0;
  let withValue = 0;
  for (const r of rows) {
    const cid = parseInt(r.syncro_customer_id!, 10);
    if (Number.isNaN(cid)) {
      console.log(`  ${r.name}: invalid syncro id "${r.syncro_customer_id}" — skipping`);
      errors++;
      continue;
    }
    try {
      const c = await getCustomer(cid);
      const nextAe = extractCustomerAutoelevate(c);
      const nextLoc = extractCustomerLocation(c);
      if (nextAe) withValue++;
      const aeChanged = nextAe !== r.autoelevate_status;
      const locChanged = nextLoc !== r.location;
      if (!aeChanged && !locChanged) {
        unchanged++;
        continue;
      }
      await client.query(
        `UPDATE clients
            SET autoelevate_status = $1,
                location = $2,
                updated_at = NOW()
          WHERE id = $3`,
        [nextAe, nextLoc, r.id],
      );
      changed++;
      console.log(
        `  ${r.name}: AE ${r.autoelevate_status ?? "—"} → ${nextAe ?? "—"}` +
          (locChanged ? `, loc ${r.location ?? "—"} → ${nextLoc ?? "—"}` : ""),
      );
    } catch (e) {
      errors++;
      console.log(`  ${r.name}: ERROR ${(e as Error).message}`);
    }
  }

  console.log(
    `\nDone. changed=${changed}  unchanged=${unchanged}  errors=${errors}  ` +
      `(of ${rows.length} probed, ${withValue} have an AE value populated in Syncro)`,
  );
  await client.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
