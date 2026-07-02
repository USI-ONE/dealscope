/**
 * Probe every common Ingram Reseller API endpoint with the existing
 * clientId to identify exactly what got approved and bound to the key.
 *
 * The Reseller API and the Cloud Marketplace Platform share OAuth but
 * have separate Apigee product bindings — passing one doesn't grant
 * the other. This script tells us which one (or both) we now have.
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
  if (!r.ok) throw new Error(`OAuth HTTP ${r.status}`);
  return (await r.json()).access_token;
}

async function probe(token, customerNumber, pathName, method = "GET", body = null) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "IM-CustomerNumber": customerNumber,
    "IM-CorrelationID": crypto.randomUUID(),
    "IM-CountryCode": "US",
  };
  const init = { method, headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${API_BASE}${pathName}`, init);
  const text = await r.text().catch(() => "");
  return { status: r.status, body: text };
}

function summarize(result) {
  const { status, body } = result;
  if (status === 200) {
    try {
      const j = JSON.parse(body);
      const keys = Object.keys(j).slice(0, 5).join(", ");
      const total =
        j.recordsFound ??
        j.totalRecords ??
        (Array.isArray(j) ? j.length : "?");
      return `200 OK — total=${total}, keys=[${keys}]`;
    } catch {
      return `200 (non-JSON, ${body.length}b)`;
    }
  }
  if (status === 401) {
    if (/no apiproduct match/i.test(body)) return "401 NO-APIPRODUCT (still blocked)";
    return `401: ${body.slice(0, 100)}`;
  }
  if (status === 403) return `403: ${body.slice(0, 100)}`;
  if (status === 404) return `404 not found`;
  if (status === 400) return `400: ${body.slice(0, 120)}`;
  return `${status}: ${body.slice(0, 100)}`;
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const c = new Client({ connectionString: url });
  await c.connect();
  const r = await c.query(
    `select config_json from vendor_connections where kind='ingram_micro' limit 1`,
  );
  await c.end();
  const cfg = r.rows[0].config_json;

  const token = await getToken(cfg.clientId, cfg.clientSecret);
  console.log("OAuth token: OK\n");
  console.log(
    "Probing endpoints with clientId=" + cfg.clientId.slice(0, 8) + "…, customer=" +
      cfg.customerNumber +
      "\n",
  );

  const ENDPOINTS = [
    // === Reseller API (what got approved per the link) ===
    "/resellers/v6/customers?pageSize=5",
    "/resellers/v6/orders?pageSize=5",
    "/resellers/v6/orders/search?pageSize=5",
    "/resellers/v6/invoices?pageSize=5",
    "/resellers/v6/invoices/search?pageSize=5",
    "/resellers/v6/quotes?pageSize=5",
    "/resellers/v6/products/search?keyWord=microsoft&pageSize=5",
    "/resellers/v6/products/priceandavailability?customerNumber=" + cfg.customerNumber,
    "/resellers/v6/freightestimate?pageSize=1",
    "/resellers/v6/deals?pageSize=5",
    "/resellers/v6/renewals?pageSize=5",
    // === Cloud Marketplace Platform (CMP) — separate binding ===
    "/resellers/v6/subscriptions?pageSize=5",
    "/resellers/v6/subscriptions/microsoft?pageSize=5",
    "/resellers/v6/cmp/subscriptions?pageSize=5",
    "/resellers/v6/cmp/customers?pageSize=5",
    // === Catalog/utility ===
    "/resellers/v6/catalog?pageSize=5",
    "/resellers/v6/utilities/countryCodes",
  ];

  const results = [];
  for (const ep of ENDPOINTS) {
    process.stdout.write(`  ${ep.padEnd(70)} `);
    try {
      const res = await probe(token, cfg.customerNumber, ep);
      const summary = summarize(res);
      console.log(summary);
      results.push({ ep, status: res.status, summary, body: res.body });
    } catch (err) {
      console.log(`ERR ${err.message}`);
      results.push({ ep, error: err.message });
    }
  }

  console.log("\n=== SUMMARY ===");
  const ok = results.filter((r) => r.status === 200);
  const blocked = results.filter((r) => r.status === 401);
  const notfound = results.filter((r) => r.status === 404);
  const other = results.filter(
    (r) => r.status !== 200 && r.status !== 401 && r.status !== 404,
  );
  console.log(`200 OK:        ${ok.length}`);
  console.log(`401 (blocked): ${blocked.length}`);
  console.log(`404:           ${notfound.length}`);
  console.log(`other:         ${other.length}`);

  if (ok.length > 0) {
    console.log("\nUSABLE endpoints (200):");
    for (const r of ok) console.log("  " + r.ep);
    console.log("\nFirst usable response body (head):");
    const sample = ok[0];
    try {
      console.log(JSON.stringify(JSON.parse(sample.body), null, 2).slice(0, 1500));
    } catch {
      console.log(sample.body.slice(0, 800));
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
