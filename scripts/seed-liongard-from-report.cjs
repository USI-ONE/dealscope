/**
 * One-shot: seed vendor_seat_snapshots + vendor_client_mappings for the
 * Liongard connection from the manually-tracked April 2026 counts in
 * SharePoint:
 *
 *   /sites/IXE/Shared Documents/General/Reports/Liongard Counts2-26.xlsx
 *
 * This is a stop-gap until the actual Liongard API credentials are
 * provisioned (currently being requested in a Teams thread). Once the
 * key lands, the operator can drop it into
 * /settings/integrations/liongard and the next sync will OVERWRITE these
 * snapshots with live numbers. The vendor_client_mappings persist
 * across syncs, so the mapping work done here is permanent.
 *
 * Source data — April 2026 billable Liongard agents:
 *
 *   AHP                  192
 *   Collision Leaders     84
 *   Black Slate           80
 *   Industrial Injection 140
 *   Medify                54
 *   Rosing                20
 *   RMEV                  11
 *   Rico                  23
 *   Urgent Access          7
 *   Aladdin                6
 *   Outdoor Expressions   40
 *   Guardian              52
 *   E-corp                48
 *   G54                   36
 *   EkoCardia              1
 *   Taylor Built Homes    10
 *   Fillerup              12
 *   CardiaSpace            8
 *                        ----
 *                        824
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");

const ORG_NAME = "Universal Systems Inc";

/**
 * Liongard environment name → preferred TechOS client name. Names from
 * the April 2026 report (left) and the canonical TechOS client name
 * (right). Resolution is fuzzy on the right — case + non-alphanumeric
 * are stripped before matching.
 */
const ENVIRONMENT_TO_CLIENT = {
  AHP: "AHP",
  "Collision Leaders": "Collision Leaders",
  "Black Slate": "Black Slate Partners",
  "Industrial Injection": "Industrial Injection",
  Medify: "Medify",
  Rosing: "Rosing Davidson & Frost",
  RMEV: "Rocky Mountain Emergency Vehicle",
  Rico: null, // operator decides — no obvious TechOS match
  "Urgent Access": null, // operator decides
  Aladdin: "Aladdin Skylights",
  "Outdoor Expressions": "Outdoor Expressions",
  Guardian: "Guardian",
  "E-corp": "E-Corp",
  G54: null, // operator decides
  EkoCardia: "Ekocardia",
  "Taylor Built Homes": null, // operator decides
  Fillerup: "Filler Up",
  CardiaSpace: "CardiaSpace",
};

const SEAT_COUNTS = [
  ["AHP", 192],
  ["Collision Leaders", 84],
  ["Black Slate", 80],
  ["Industrial Injection", 140],
  ["Medify", 54],
  ["Rosing", 20],
  ["RMEV", 11],
  ["Rico", 23],
  ["Urgent Access", 7],
  ["Aladdin", 6],
  ["Outdoor Expressions", 40],
  ["Guardian", 52],
  ["E-corp", 48],
  ["G54", 36],
  ["EkoCardia", 1],
  ["Taylor Built Homes", 10],
  ["Fillerup", 12],
  ["CardiaSpace", 8],
];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString: url });
  await c.connect();

  const orgRes = await c.query("select id from organizations where name = $1", [
    ORG_NAME,
  ]);
  if (orgRes.rows.length === 0) throw new Error(`Org "${ORG_NAME}" not found`);
  const orgId = orgRes.rows[0].id;

  // Find the Liongard vendor (in the catalog) and connection row.
  const vRes = await c.query(
    "select id from vendors where organization_id = $1 and lower(name) = 'liongard' limit 1",
    [orgId],
  );
  const vendorId = vRes.rows[0]?.id ?? null;
  if (!vendorId) {
    console.warn(
      "No vendors row named 'Liongard' yet — the connection won't be linked to a vendor.",
    );
  }

  const connRes = await c.query(
    "select id from vendor_connections where organization_id = $1 and kind = 'liongard' limit 1",
    [orgId],
  );
  if (connRes.rows.length === 0) {
    throw new Error(
      "No vendor_connections row for kind=liongard. Visit /settings/integrations once so it gets auto-created, then re-run.",
    );
  }
  const connectionId = connRes.rows[0].id;

  // Attach the vendor (so the vendor detail page surfaces snapshots)
  // and pre-fill the baseUrl with USI's tenant guess so the form is
  // half-done when the operator drops in the access key.
  await c.query(
    `update vendor_connections
        set vendor_id = COALESCE(vendor_id, $1),
            config_json = config_json || $2::jsonb,
            last_sync_message = $3,
            updated_at = now()
      where id = $4`,
    [
      vendorId,
      JSON.stringify({ baseUrl: "https://usi.app.liongard.com" }),
      "Seeded from manual April 2026 report. Drop in accessKeyId + accessKeySecret to go live.",
      connectionId,
    ],
  );
  console.log("vendor_connection: vendor_id linked + baseUrl prefilled");

  // Pull TechOS clients for fuzzy match.
  const clientsRes = await c.query(
    "select id, name from clients where organization_id = $1",
    [orgId],
  );
  const clientByNorm = new Map();
  for (const r of clientsRes.rows) {
    clientByNorm.set(norm(r.name), r);
  }

  // Map env → TechOS client where we can.
  let mapped = 0;
  let unmappedNames = [];
  const envToClientId = new Map();
  for (const [envName, expectedClient] of Object.entries(ENVIRONMENT_TO_CLIENT)) {
    if (!expectedClient) {
      unmappedNames.push(envName);
      continue;
    }
    const match = clientByNorm.get(norm(expectedClient));
    if (!match) {
      console.warn(
        `  ! TechOS client "${expectedClient}" not found — skipping ${envName}`,
      );
      unmappedNames.push(envName);
      continue;
    }
    envToClientId.set(envName, match.id);
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
      [orgId, connectionId, envName, envName, match.id],
    );
    mapped++;
  }
  console.log(`vendor_client_mappings: ${mapped} environments mapped`);
  if (unmappedNames.length > 0) {
    console.log(
      `  unmapped (operator-resolve via /settings/integrations/liongard): ${unmappedNames.join(", ")}`,
    );
  }

  // Seed snapshots. Use a fixed captured_at so re-runs don't pile up.
  // Snapshot timestamp = end of April 2026 (the report's period).
  const capturedAt = new Date("2026-04-30T23:59:00Z");
  let snapshotsInserted = 0;
  for (const [envName, seats] of SEAT_COUNTS) {
    const clientId = envToClientId.get(envName) ?? null;
    // Idempotency: delete prior seed snapshots for this (env, sku, ts)
    // first so re-running is clean.
    await c.query(
      `delete from vendor_seat_snapshots
        where vendor_connection_id = $1
          and vendor_client_identifier = $2
          and product_sku = 'liongard_environment'
          and captured_at = $3`,
      [connectionId, envName, capturedAt],
    );
    await c.query(
      `insert into vendor_seat_snapshots
         (organization_id, vendor_connection_id,
          vendor_client_identifier, vendor_client_name, client_id,
          product_sku, product_name,
          seats, captured_at, raw_response)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        orgId,
        connectionId,
        envName,
        envName,
        clientId,
        "liongard_environment",
        "Liongard Environment (billable agent count)",
        seats,
        capturedAt,
        JSON.stringify({
          source: "Liongard Counts2-26.xlsx, April 2026 column",
          note: "manual seed pending live API connection",
        }),
      ],
    );
    snapshotsInserted++;
  }
  const total = SEAT_COUNTS.reduce((s, [, n]) => s + n, 0);
  console.log(
    `vendor_seat_snapshots: ${snapshotsInserted} rows seeded (${total} total billable agents)`,
  );

  await c.end();
  console.log("\nDone. Reconciliation report at /finance/reconciliation will");
  console.log("now show paid-vs-billed gaps for every mapped client.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
