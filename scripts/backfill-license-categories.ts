/**
 * One-shot: auto-categorize every active license that's still on the
 * default 'other_saas' category using name-pattern matching from
 * src/lib/licenses/categorize.ts. Never clobbers a manual category.
 *
 *   pnpm exec tsx scripts/backfill-license-categories.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { Client } from "pg";
import { categorize, CATEGORY_LABEL } from "../src/lib/licenses/categorize";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(`
    SELECT l.id, l.product_name, l.category, v.name AS vendor
      FROM licenses l
      LEFT JOIN vendors v ON v.id = l.vendor_id
     WHERE l.status='active'
     ORDER BY l.product_name`);

  const counts = new Map<string, number>();
  let updated = 0;
  let alreadyManual = 0;
  for (const row of r.rows as Array<{
    id: string;
    product_name: string;
    category: string;
    vendor: string | null;
  }>) {
    const cat = categorize(row.product_name, row.vendor);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
    if (row.category !== "other_saas") {
      alreadyManual++;
      continue;
    }
    if (cat === row.category) continue;
    await c.query(
      `UPDATE licenses SET category = $1, updated_at = NOW() WHERE id = $2`,
      [cat, row.id],
    );
    console.log(`  ${row.product_name.padEnd(40)} → ${cat}`);
    updated++;
  }
  console.log(
    `\nUpdated ${updated} of ${r.rows.length} licenses ` +
      `(${alreadyManual} already had a non-default category).\n`,
  );
  console.log("Distribution after categorize:");
  for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${String(n).padStart(3)}  ${(CATEGORY_LABEL as Record<string, string>)[k] ?? k}`,
    );
  }
  await c.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
