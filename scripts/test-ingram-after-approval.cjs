/**
 * One-shot: retest the Ingram Micro connection now that USI has
 * received Reseller API approval. Loads saved credentials from
 * vendor_connections (kind=ingram_micro), mints an OAuth token,
 * and hits /resellers/v6/subscriptions/microsoft with a tiny page.
 *
 * If Apigee still 401s with "no apiproduct match" → approval hasn't
 * propagated to this clientId yet (or is bound to a different env).
 *
 * If it returns 200 → we list what came back, write snapshots, and
 * flip the connection to status=connected.
 *
 * Usage: node scripts/test-ingram-after-approval.cjs
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");
const crypto = require("crypto");

const TOKEN_URL = "https://api.ingrammicro.com/oauth/oauth20/token";
const API_BASE = "https://api.ingrammicro.com";

async function getToken(clientId, clientSecret) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`OAuth → HTTP ${r.status}: ${body.slice(0, 300)}`);
  }
  const j = await r.json();
  if (!j.access_token) throw new Error("OAuth response missing access_token");
  return j.access_token;
}

async function ingramGet(token, customerNumber, pathName) {
  const r = await fetch(`${API_BASE}${pathName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "IM-CustomerNumber": customerNumber,
      "IM-CorrelationID": crypto.randomUUID(),
      "IM-CountryCode": "US",
    },
  });
  const body = await r.text();
  if (!r.ok) {
    const truncated = body.slice(0, 400);
    const err = new Error(`HTTP ${r.status} on ${pathName}: ${truncated}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Non-JSON response from ${pathName}: ${body.slice(0, 200)}`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const c = new Client({ connectionString: url });
  await c.connect();

  const connRes = await c.query(
    `select id, organization_id, config_json
       from vendor_connections
      where kind = 'ingram_micro'
      limit 1`,
  );
  if (connRes.rows.length === 0) {
    throw new Error("No vendor_connections row for kind=ingram_micro.");
  }
  const conn = connRes.rows[0];
  const cfg = conn.config_json || {};
  if (!cfg.clientId || !cfg.clientSecret || !cfg.customerNumber) {
    throw new Error(
      "Saved config missing clientId / clientSecret / customerNumber.",
    );
  }
  console.log(
    `Loaded creds — clientId=${cfg.clientId.slice(0, 8)}…, customer=${cfg.customerNumber}`,
  );

  console.log("Minting OAuth token…");
  const token = await getToken(cfg.clientId, cfg.clientSecret);
  console.log(`  token ok (${token.slice(0, 10)}…)`);

  // Try the M365 subscriptions endpoint first — that's what the
  // production connector uses.
  console.log(
    "Calling /resellers/v6/subscriptions/microsoft?pageSize=5 …",
  );
  let m365;
  try {
    m365 = await ingramGet(
      token,
      cfg.customerNumber,
      "/resellers/v6/subscriptions/microsoft?pageSize=5",
    );
  } catch (err) {
    const body = err.body || err.message;
    if (/no apiproduct match/i.test(body)) {
      console.error(
        "STILL PENDING — Apigee returned 'no apiproduct match'. Approval may be tied to a different clientId, or not yet propagated.",
      );
      await c.query(
        `update vendor_connections
            set last_sync_message = $1, updated_at = now()
          where id = $2`,
        [
          "Approval received externally but Apigee still no-product-match on " +
            new Date().toISOString(),
          conn.id,
        ],
      );
      await c.end();
      process.exit(2);
    }
    // Try the broader /subscriptions endpoint in case Microsoft was a
    // separate product binding.
    console.error(`M365 endpoint failed: ${err.message}`);
    console.log("Falling back to /resellers/v6/subscriptions?pageSize=5 …");
    try {
      m365 = await ingramGet(
        token,
        cfg.customerNumber,
        "/resellers/v6/subscriptions?pageSize=5",
      );
    } catch (err2) {
      console.error(`Fallback also failed: ${err2.message}`);
      await c.query(
        `update vendor_connections set status='failed',
                last_sync_message=$1, updated_at=now()
          where id=$2`,
        [err2.message.slice(0, 300), conn.id],
      );
      await c.end();
      process.exit(3);
    }
  }

  console.log("\n=== RAW RESPONSE (top of body) ===");
  console.log(JSON.stringify(m365, null, 2).slice(0, 2000));
  console.log("...\n");

  const subs = m365.subscriptions || m365.data || [];
  const total = m365.recordsFound ?? m365.totalRecords ?? subs.length;
  console.log(`Subscriptions visible (this page): ${subs.length}`);
  console.log(`Total records reported by API: ${total}`);

  if (subs.length > 0) {
    console.log("\nFirst few subscriptions:");
    for (const s of subs.slice(0, 5)) {
      const customer =
        s.customer?.companyName ??
        s.customer?.name ??
        s.customerName ??
        s.customerNumber ??
        "?";
      const sku = s.sku ?? s.partNumber ?? "?";
      const desc = s.description ?? sku;
      const qty = s.seats ?? s.quantity ?? "?";
      console.log(`  • ${customer} — ${sku} ${desc} × ${qty}`);
    }
  }

  // Also probe /resellers/v6/customers to confirm customer-list access.
  console.log("\nCalling /resellers/v6/customers?pageSize=5 …");
  try {
    const custs = await ingramGet(
      token,
      cfg.customerNumber,
      "/resellers/v6/customers?pageSize=5",
    );
    const list = custs.customers || custs.data || [];
    console.log(
      `Customers visible: ${list.length} (of ${custs.recordsFound ?? "?"} total)`,
    );
    for (const k of list.slice(0, 5)) {
      console.log(
        `  • ${k.customerNumber ?? k.id ?? "?"} — ${k.companyName ?? k.name ?? "?"}`,
      );
    }
  } catch (err) {
    console.log(`  (customers endpoint: ${err.message})`);
  }

  await c.query(
    `update vendor_connections
        set status='connected',
            last_sync_at=now(),
            last_sync_message=$1,
            updated_at=now()
      where id=$2`,
    [
      `Reseller API live — ${subs.length} subs on first page, ${total} total reported`,
      conn.id,
    ],
  );

  console.log("\nIngram connection flipped to status=connected.");
  console.log(
    "Next: run a full sync via /settings/integrations/ingram_micro or the syncConnection action.",
  );

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
