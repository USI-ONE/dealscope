/**
 * One-shot: save Liongard API credentials to the
 * vendor_connections row for kind=liongard, then run a live test
 * against /v1/environments using the same HMAC-JWT auth flow the
 * production connector uses.
 *
 * Usage:
 *   LG_BASE_URL=https://us6.api.liongard.com \
 *   LG_KEY_ID=...                            \
 *   LG_KEY_SECRET=...                        \
 *     node scripts/set-liongard-key.cjs
 *
 * Never logs the secret. Reports:
 *   - whether the row was updated
 *   - the count of visible environments + inspector instances + systems
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");
const crypto = require("crypto");

const ORG_NAME = "Universal Systems Inc";

function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(keyId, keySecret) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aki: keyId, iat: now, exp: now + 60 };
  const headerSeg = base64url(JSON.stringify(header));
  const payloadSeg = base64url(JSON.stringify(payload));
  const signingInput = `${headerSeg}.${payloadSeg}`;
  const sig = crypto
    .createHmac("sha256", keySecret)
    .update(signingInput)
    .digest();
  const sigSeg = base64url(sig);
  return `${signingInput}.${sigSeg}`;
}

async function liongardGet(baseUrl, keyId, keySecret, pathName) {
  const jwt = makeJwt(keyId, keySecret);
  const r = await fetch(`${baseUrl}${pathName}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
  });
  if (r.status === 401 || r.status === 403) {
    const body = await r.text().catch(() => "");
    throw new Error(`Auth rejected (${r.status}): ${body.slice(0, 200)}`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function main() {
  const baseUrl = (process.env.LG_BASE_URL ?? "").replace(/\/+$/, "");
  const keyId = process.env.LG_KEY_ID ?? "";
  const keySecret = process.env.LG_KEY_SECRET ?? "";
  if (!baseUrl || !keyId || !keySecret) {
    console.error("LG_BASE_URL, LG_KEY_ID, LG_KEY_SECRET env vars are required.");
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

  // Find / create the Liongard catalog vendor link.
  const vRes = await c.query(
    `select id, name from vendors
       where organization_id = $1
         and (lower(name) like 'liongard%' or lower(slug) like 'liongard%')
       order by lower(name) limit 1`,
    [orgId],
  );
  const vendorId = vRes.rows[0]?.id ?? null;
  if (vendorId) {
    console.log(`Linking to catalog vendor: ${vRes.rows[0].name}`);
  } else {
    console.log(
      "No catalog vendor named 'Liongard*' — connection saves without vendor_id.",
    );
  }

  const connRes = await c.query(
    `select id from vendor_connections
       where organization_id = $1 and kind = 'liongard' limit 1`,
    [orgId],
  );
  if (connRes.rows.length === 0) {
    throw new Error(
      "No vendor_connections row for kind=liongard. Visit /settings/integrations once so it gets auto-created, then re-run.",
    );
  }
  const connectionId = connRes.rows[0].id;

  await c.query(
    `update vendor_connections
        set vendor_id = COALESCE(vendor_id, $1),
            display_name = 'Liongard',
            config_json = jsonb_build_object(
              'baseUrl', $2::text,
              'accessKeyId', $3::text,
              'accessKeySecret', $4::text
            ),
            status = 'configured',
            updated_at = now()
      where id = $5`,
    [vendorId, baseUrl, keyId, keySecret, connectionId],
  );
  console.log("Credentials saved.");

  console.log("Testing connection against /v1/environments...");
  let envs, instances, systems;
  try {
    envs = await liongardGet(baseUrl, keyId, keySecret, "/v1/environments");
    instances = await liongardGet(
      baseUrl,
      keyId,
      keySecret,
      "/v1/inspectorInstances",
    );
    systems = await liongardGet(baseUrl, keyId, keySecret, "/v1/systems");
  } catch (err) {
    const msg = err.message ?? String(err);
    await c.query(
      `update vendor_connections set status = 'failed',
              last_sync_message = $1, updated_at = now()
        where id = $2`,
      [msg, connectionId],
    );
    console.error(`FAIL: ${msg}`);
    await c.end();
    process.exit(2);
  }

  console.log(
    `OK — ${envs.length} environments, ${instances.length} inspector instances, ${systems.length} system types`,
  );

  // List environments + how many of them are customer-view (skipped)
  const billable = envs.filter((e) => !e.IsCustomerView);
  console.log(
    `Billable environments (IsCustomerView=false): ${billable.length}`,
  );
  console.log("\nFirst 25 environments visible:");
  for (const e of envs.slice(0, 25)) {
    const flag = e.IsCustomerView ? " [customer-view]" : "";
    console.log(`  ${String(e.ID).padStart(8)} ${e.Title}${flag}`);
  }
  if (envs.length > 25) console.log(`  ... + ${envs.length - 25} more`);

  await c.query(
    `update vendor_connections set status = 'connected',
            last_sync_message = $1, updated_at = now()
      where id = $2`,
    [
      `Connected — ${billable.length} billable environments, ${instances.length} inspector instances`,
      connectionId,
    ],
  );

  await c.end();
  console.log("\nDone. Liongard status=connected.");
  console.log(
    "Next: I'll auto-map environments to TechOS clients by name + run the first sync.",
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
