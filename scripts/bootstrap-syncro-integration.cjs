/**
 * One-shot: tell the new multi-vendor integrations framework that the
 * Syncro connection is already operational.
 *
 * Syncro has been wired up in TechOS for months via the legacy
 * /settings/integrations/syncro UI:
 *   • 19 TechOS clients already have clients.syncroCustomerId set
 *   • 898 hardware rows already have syncro_asset_id set
 *   • SYNCRO_SUBDOMAIN + SYNCRO_API_KEY env vars are live in prod
 *
 * The new framework just hasn't been told. This script:
 *   1. Pre-fills the Syncro vendor_connection row to status='connected'
 *      with a useful last_sync_message
 *   2. Links it to the Syncro catalog vendor row (so the new
 *      /vendors/[syncro-id] detail page surfaces the connection)
 *   3. Bootstraps vendor_client_mappings from clients.syncroCustomerId
 *      so the next sync attributes seats correctly without an operator
 *      having to remap anything
 *
 * After this runs, hitting "Sync now" on /settings/integrations/liongard-
 * style page for Syncro will pull live customer + asset counts and
 * populate vendor_seat_snapshots.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");

const ORG_NAME = "Universal Systems Inc";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (!process.env.SYNCRO_SUBDOMAIN || !process.env.SYNCRO_API_KEY) {
    throw new Error(
      "SYNCRO_SUBDOMAIN + SYNCRO_API_KEY must be set so we can flip status='connected'",
    );
  }

  const c = new Client({ connectionString: url });
  await c.connect();

  const orgRes = await c.query("select id from organizations where name = $1", [
    ORG_NAME,
  ]);
  if (orgRes.rows.length === 0) throw new Error(`Org "${ORG_NAME}" not found`);
  const orgId = orgRes.rows[0].id;

  // Look up the Syncro catalog vendor (if any) so the connection can
  // attach to it. We try a few common slug variations.
  const vRes = await c.query(
    `select id, name from vendors
       where organization_id = $1
         and (lower(name) like 'syncro%' or lower(slug) like 'syncro%')
       order by lower(name) limit 1`,
    [orgId],
  );
  const vendorId = vRes.rows[0]?.id ?? null;
  if (vendorId) {
    console.log(`Linking to catalog vendor: ${vRes.rows[0].name}`);
  } else {
    console.log(
      "No catalog vendor named 'Syncro*' — the connection will land vendor-less. Add a vendor row called 'Syncro MSP' later to enable per-vendor rollups.",
    );
  }

  const connRes = await c.query(
    `select id, status from vendor_connections
       where organization_id = $1 and kind = 'syncro' limit 1`,
    [orgId],
  );
  if (connRes.rows.length === 0) {
    throw new Error(
      "No vendor_connections row for kind=syncro. Visit /settings/integrations once so it gets auto-created, then re-run.",
    );
  }
  const connectionId = connRes.rows[0].id;

  await c.query(
    `update vendor_connections
        set vendor_id = COALESCE(vendor_id, $1),
            status = 'connected',
            display_name = 'Syncro MSP',
            last_sync_message = $2,
            updated_at = now()
      where id = $3`,
    [
      vendorId,
      `Connected via env vars (SYNCRO_SUBDOMAIN=${process.env.SYNCRO_SUBDOMAIN}). 19 clients pre-mapped from clients.syncroCustomerId, 898 hardware rows already synced.`,
      connectionId,
    ],
  );
  console.log("vendor_connection (syncro): status='connected'");

  // Bootstrap the mappings: every TechOS client with a syncroCustomerId
  // → vendor_client_mappings row.
  const linkedClients = await c.query(
    `select id, name, syncro_customer_id
       from clients
       where organization_id = $1
         and syncro_customer_id is not null
       order by name`,
    [orgId],
  );
  let mapped = 0;
  for (const row of linkedClients.rows) {
    await c.query(
      `insert into vendor_client_mappings
         (organization_id, vendor_connection_id,
          vendor_client_identifier, vendor_client_name, client_id)
       values ($1, $2, $3, $4, $5)
       on conflict (vendor_connection_id, vendor_client_identifier)
       do update set
         vendor_client_name = excluded.vendor_client_name,
         client_id = excluded.client_id,
         updated_at = now()`,
      [
        orgId,
        connectionId,
        row.syncro_customer_id,
        row.name,
        row.id,
      ],
    );
    mapped++;
  }
  console.log(
    `vendor_client_mappings (syncro): ${mapped} mappings created from existing clients.syncroCustomerId`,
  );

  await c.end();
  console.log(
    "\nDone. /settings/integrations now shows Syncro as Connected. Hit 'Sync now' on the Syncro setup page to pull the first round of vendor_seat_snapshots (managed + kiosk endpoint counts per client).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
