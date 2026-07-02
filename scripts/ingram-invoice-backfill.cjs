/**
 * Backfill: pull every Ingram invoice into vendor_bills.
 *
 * Self-contained (matches the test-ingram-after-approval.cjs +
 * probe-ingram-reseller-api.cjs pattern). Talks directly to Postgres
 * and the Ingram Reseller API — no Next runtime needed.
 *
 * Idempotent on (organization_id, vendor_id, external_id=invoice#).
 *
 *   node scripts/ingram-invoice-backfill.cjs
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
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${pathName}: ${body.slice(0, 250)}`);
  return JSON.parse(body);
}

function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

function toCents(v) {
  if (v == null || Number.isNaN(v)) return 0;
  return Math.round(v * 100);
}

function mapStatus(s) {
  if (!s) return "received";
  return /paid/i.test(s) ? "paid" : "received";
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString: url });
  await c.connect();

  // 1. Load connection.
  const cr = await c.query(
    `select id, organization_id, config_json
       from vendor_connections where kind='ingram_micro' limit 1`,
  );
  if (cr.rows.length === 0) throw new Error("No ingram_micro vendor_connections row");
  const conn = cr.rows[0];
  const cfg = conn.config_json;

  // 2. Resolve catalog vendor.
  const vr = await c.query(
    `select id, name from vendors
       where organization_id=$1 and lower(name)='ingram micro'
       limit 1`,
    [conn.organization_id],
  );
  if (vr.rows.length === 0) {
    throw new Error(
      "No 'Ingram Micro' vendor in catalog. Add one in /vendors first.",
    );
  }
  const vendor = vr.rows[0];
  console.log(`Vendor: ${vendor.name} (${vendor.id})`);

  // 3. Mint token + paginate /invoices.
  console.log("Minting OAuth token…");
  const token = await getToken(cfg.clientId, cfg.clientSecret);
  console.log("Pulling invoices (paginated, 100/page)…");
  const invoices = [];
  let page = 1;
  for (;;) {
    const data = await ingramGet(
      token,
      cfg.customerNumber,
      `/resellers/v6/invoices?pageSize=100&pageNumber=${page}`,
    );
    const list = data.invoices ?? [];
    invoices.push(...list);
    process.stdout.write(`  page ${page}: ${list.length} (total so far ${invoices.length} / ${data.recordsFound ?? "?"})\n`);
    if (list.length < 100) break;
    page++;
    if (page > 200) {
      console.warn("Safety stop at 200 pages.");
      break;
    }
  }
  console.log(`Fetched ${invoices.length} invoices.`);

  // 3b. Dedupe in memory — Ingram pagination can return the same
  // invoice_number across pages (credit memos, re-issues). Keep last.
  const dedup = new Map();
  for (const inv of invoices) {
    if (!inv.invoiceNumber) continue;
    dedup.set(inv.invoiceNumber, inv);
  }
  const deduped = Array.from(dedup.values());
  if (deduped.length < invoices.length) {
    console.log(`After dedupe: ${deduped.length} unique invoice numbers`);
  }

  // 4. Pre-load existing external_ids.
  const er = await c.query(
    `select id, external_id from vendor_bills
       where organization_id=$1 and vendor_id=$2 and external_id is not null`,
    [conn.organization_id, vendor.id],
  );
  const existing = new Map(er.rows.map((r) => [r.external_id, r.id]));
  console.log(`Existing API-sourced bills already in DB: ${existing.size}`);

  // 5. Upsert.
  let inserted = 0,
    updated = 0,
    skipped = 0,
    errors = 0;
  for (const inv of deduped) {
    if (!inv.invoiceNumber) {
      skipped++;
      continue;
    }
    const externalId = inv.invoiceNumber;
    const totalCents = toCents(inv.invoiceAmountInclTax);
    const status = mapStatus(inv.invoiceStatus);
    const paidAt = status === "paid" ? parseDate(inv.invoiceDate) : null;
    const receivedAt = parseDate(inv.invoiceDate);
    const dueAt = parseDate(inv.invoiceDueDate);
    const periodStart = parseDate(inv.orderCreateDate);
    const periodEnd = parseDate(inv.invoiceDate);
    const notes = [
      inv.purchaseType ? `Purchase type: ${inv.purchaseType}` : null,
      inv.ingramOrderNumber ? `Ingram order: ${inv.ingramOrderNumber}` : null,
      inv.customerOrderNumber ? `USI PO: ${inv.customerOrderNumber}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

    try {
      const existingId = existing.get(externalId);
      if (existingId) {
        await c.query(
          `update vendor_bills
              set received_at=$1, due_at=$2, paid_at=$3,
                  period_start=$4, period_end=$5,
                  subtotal_cents=$6, tax_cents=0, total_cents=$6,
                  status=$7, external_metadata_json=$8,
                  updated_at=now()
            where id=$9`,
          [
            receivedAt,
            dueAt,
            paidAt,
            periodStart,
            periodEnd,
            totalCents,
            status,
            JSON.stringify(inv),
            existingId,
          ],
        );
        updated++;
      } else {
        await c.query(
          `insert into vendor_bills (
             organization_id, vendor_id, invoice_number,
             received_at, due_at, paid_at,
             period_start, period_end,
             subtotal_cents, tax_cents, total_cents,
             status, source, external_id, external_metadata_json, notes
           ) values (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,0,$9,$10,'ingram_api',$11,$12,$13
           )`,
          [
            conn.organization_id,
            vendor.id,
            inv.invoiceNumber,
            receivedAt,
            dueAt,
            paidAt,
            periodStart,
            periodEnd,
            totalCents,
            status,
            externalId,
            JSON.stringify(inv),
            notes,
          ],
        );
        inserted++;
      }
    } catch (e) {
      console.error(`  err on ${inv.invoiceNumber}: ${e.message}`);
      errors++;
    }
  }

  // 6. Stamp connection.
  await c.query(
    `update vendor_connections
        set last_sync_at=now(),
            last_sync_message=$1,
            updated_at=now()
      where id=$2`,
    [
      `Invoice backfill — ${inserted} new, ${updated} updated, ${skipped} skipped, ${errors} errors (of ${invoices.length})`,
      conn.id,
    ],
  );

  console.log("\n=== Backfill complete ===");
  console.log(`  fetched : ${invoices.length}`);
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated : ${updated}`);
  console.log(`  skipped : ${skipped}`);
  console.log(`  errors  : ${errors}`);

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
