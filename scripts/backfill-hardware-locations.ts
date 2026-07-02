/**
 * One-shot: re-pull Syncro assets for every Syncro-linked client and set
 * hardware.location_id based on each asset's Location custom field
 * (falling back to the client's location). Auto-creates client_locations
 * rows for any new label encountered.
 *
 * Safe to re-run.
 *
 *   pnpm exec tsx scripts/backfill-hardware-locations.ts
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import pg from "pg";
import {
  extractAssetLocation,
  isSyncroConfigured,
  listAssetsForCustomer,
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
  const c = new pg.Client({ connectionString: url });
  await c.connect();

  const clientsRes = await c.query<{
    id: string;
    organization_id: string;
    name: string;
    syncro_customer_id: string;
    location: string | null;
  }>(
    `SELECT id, organization_id, name, syncro_customer_id, location
       FROM clients
      WHERE syncro_customer_id IS NOT NULL
      ORDER BY name`,
  );

  console.log(`Probing ${clientsRes.rows.length} Syncro-linked client(s)…\n`);

  let totalAssetsTouched = 0;
  let totalAssetsWithLoc = 0;
  let totalLocsCreated = 0;
  let totalLinked = 0;
  let totalSkipped = 0;

  for (const cli of clientsRes.rows) {
    const cid = parseInt(cli.syncro_customer_id, 10);
    if (Number.isNaN(cid)) continue;

    // Load existing locations once.
    const locRes = await c.query<{ id: string; label: string }>(
      `SELECT id, label FROM client_locations WHERE client_id = $1`,
      [cli.id],
    );
    const locByLabel = new Map<string, string>();
    for (const l of locRes.rows) locByLabel.set(l.label.trim().toLowerCase(), l.id);

    const fallback = (cli.location ?? "").trim() || null;

    let assets;
    try {
      assets = await listAssetsForCustomer(cid);
    } catch (e) {
      console.log(`  ${cli.name}: fetch failed — ${(e as Error).message}`);
      continue;
    }

    let touched = 0;
    let withLoc = 0;
    let linked = 0;
    let created = 0;
    for (const a of assets) {
      const labelFromAsset = extractAssetLocation(a);
      const label = (labelFromAsset ?? fallback)?.trim() || null;
      if (labelFromAsset) withLoc++;
      if (!label) continue;

      // get-or-create location
      const key = label.toLowerCase();
      let locId = locByLabel.get(key);
      if (!locId) {
        const ins = await c.query<{ id: string }>(
          `INSERT INTO client_locations
             (organization_id, client_id, label, is_primary, country, notes,
              created_at, updated_at)
           VALUES ($1, $2, $3, false, 'US',
                   'Auto-created from Syncro asset location.',
                   NOW(), NOW())
           RETURNING id`,
          [cli.organization_id, cli.id, label],
        );
        locId = ins.rows[0].id;
        locByLabel.set(key, locId);
        created++;
      }

      // Only update hardware rows that don't already have a location set,
      // OR whose linked Syncro asset has a different label than what
      // we'd auto-assign. To keep this simple + idempotent we only
      // UPDATE when location_id is NULL — never clobber a tech's manual
      // setting.
      const upd = await c.query(
        `UPDATE hardware
            SET location_id = $1, updated_at = NOW()
          WHERE client_id = $2
            AND syncro_asset_id = $3
            AND location_id IS NULL`,
        [locId, cli.id, String(a.id)],
      );
      if (upd.rowCount && upd.rowCount > 0) linked += upd.rowCount;
      touched++;
    }

    totalAssetsTouched += touched;
    totalAssetsWithLoc += withLoc;
    totalLocsCreated += created;
    totalLinked += linked;
    totalSkipped += assets.length - touched;
    console.log(
      `  ${cli.name}: ${assets.length} assets, ${withLoc} have asset-level Location, ` +
        `${created} new client_locations created, ${linked} hardware rows linked` +
        (fallback ? ` (fallback "${fallback}")` : ""),
    );
  }

  console.log(
    `\nDone. totalAssets=${totalAssetsTouched + totalSkipped}, ` +
      `withAssetLoc=${totalAssetsWithLoc}, locationsCreated=${totalLocsCreated}, ` +
      `hardwareLinked=${totalLinked}`,
  );
  await c.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
