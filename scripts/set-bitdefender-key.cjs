/**
 * One-shot: save a Bitdefender GravityZone API key into the
 * vendor_connections row for kind=bitdefender_gravityzone, link to the
 * catalog vendor if present, and run a live testConnection against the
 * Bitdefender Public JSON-RPC API.
 *
 * Usage:
 *   BD_API_KEY=<key> node scripts/set-bitdefender-key.cjs
 *
 * The key is NEVER logged. The script reports only:
 *   - whether the row updated
 *   - whether the live test succeeded (and the company count if so)
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");

const ORG_NAME = "Universal Systems Inc";
const BASE_URL = "https://cloud.gravityzone.bitdefender.com";

async function main() {
  const key = process.env.BD_API_KEY;
  if (!key) {
    console.error("BD_API_KEY env var is required.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const c = new Client({ connectionString: url });
  await c.connect();

  const orgRes = await c.query(
    "select id from organizations where name = $1",
    [ORG_NAME],
  );
  if (orgRes.rows.length === 0) throw new Error(`Org "${ORG_NAME}" not found`);
  const orgId = orgRes.rows[0].id;

  // Look up the catalog vendor (so the new /vendors/[id] page can
  // surface this connection).
  const vRes = await c.query(
    `select id, name from vendors
       where organization_id = $1
         and (lower(name) like 'bitdefender%' or lower(slug) like 'bitdefender%')
       order by lower(name) limit 1`,
    [orgId],
  );
  const vendorId = vRes.rows[0]?.id ?? null;
  if (vendorId) {
    console.log(`Linking to catalog vendor: ${vRes.rows[0].name}`);
  } else {
    console.log(
      "No catalog vendor named 'Bitdefender*' found — connection saves without vendor_id. Add a vendor row later for per-vendor rollups.",
    );
  }

  // Make sure the row exists.
  const connRes = await c.query(
    `select id from vendor_connections
       where organization_id = $1 and kind = 'bitdefender_gravityzone' limit 1`,
    [orgId],
  );
  if (connRes.rows.length === 0) {
    throw new Error(
      "No vendor_connections row for kind=bitdefender_gravityzone. Visit /settings/integrations once so it gets auto-created, then re-run.",
    );
  }
  const connectionId = connRes.rows[0].id;

  // Save credentials (PRE-test). We'll flip status to either
  // 'connected' or 'failed' depending on the test result below.
  await c.query(
    `update vendor_connections
        set vendor_id = COALESCE(vendor_id, $1),
            display_name = 'Bitdefender GravityZone',
            config_json = jsonb_build_object('baseUrl', $2::text, 'apiKey', $3::text),
            status = 'configured',
            updated_at = now()
      where id = $4`,
    [vendorId, BASE_URL, key, connectionId],
  );
  console.log("Credentials saved.");

  // Run a live test against the JSON-RPC companies endpoint.
  console.log("Testing connection against Bitdefender Public API...");
  let testOk = false;
  let testMessage = "";
  try {
    const body = {
      id: cryptoRandomId(),
      jsonrpc: "2.0",
      method: "getCompaniesList",
      params: { page: 1, perPage: 1 },
    };
    const r = await fetch(`${BASE_URL}/api/v1.0/jsonrpc/companies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization:
          "Basic " + Buffer.from(`${key}:`).toString("base64"),
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      testMessage = `HTTP ${r.status}`;
    } else {
      const j = await r.json();
      if (j.error) {
        testMessage = `Bitdefender error: ${j.error.message ?? JSON.stringify(j.error)}`;
      } else {
        const total =
          j.result?.total ?? j.result?.items?.length ?? "unknown";
        testOk = true;
        testMessage = `Connected — ${total} company/companies visible`;
      }
    }
  } catch (err) {
    testMessage = err?.message ?? String(err);
  }

  await c.query(
    `update vendor_connections
        set status = $1,
            last_sync_message = $2,
            updated_at = now()
      where id = $3`,
    [testOk ? "connected" : "failed", testMessage, connectionId],
  );

  if (testOk) {
    console.log(`OK: ${testMessage}`);
    console.log(
      "\nNext: hit Sync now on /settings/integrations to pull the first vendor_seat_snapshots batch (per-company per-product seat usage).",
    );
  } else {
    console.error(`FAIL: ${testMessage}`);
    console.error(
      "\nCheck that the API key has the Companies API and Licensing API scopes enabled on Bitdefender's side. The key is saved; you can re-test from the UI after fixing scopes.",
    );
    process.exit(2);
  }

  await c.end();
}

function cryptoRandomId() {
  // Avoid pulling in node:crypto in older Node versions — just use
  // Math.random for the JSON-RPC id; it doesn't need to be secure.
  return `bd-test-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
