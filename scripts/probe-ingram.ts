/**
 * Live probe of the Ingram Micro API for everything we can currently
 * pull. Reads creds from the vendor_connections row, hits each known
 * endpoint, and prints what came back. Read-only.
 *
 * Usage:
 *   pnpm tsx scripts/probe-ingram.ts
 */
import { config as loadEnv } from "dotenv";
import path from "path";
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv(); // also load .env as a fallback
import { Client } from "pg";
import { randomUUID } from "crypto";

const TOKEN_URL = "https://api.ingrammicro.com/oauth/oauth20/token";
const API_BASE = "https://api.ingrammicro.com";

async function main() {
  const pg = new Client({
    connectionString:
      process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  });
  await pg.connect();

  const { rows } = await pg.query(
    "select config_json from vendor_connections where kind='ingram_micro' limit 1",
  );
  await pg.end();
  if (rows.length === 0) throw new Error("No ingram_micro vendor_connection");
  const cfg = rows[0].config_json as {
    clientId: string;
    clientSecret: string;
    customerNumber: string;
  };
  console.log(`Customer #: ${cfg.customerNumber}`);
  console.log(`Client ID:  ${cfg.clientId.slice(0, 12)}…`);

  // Mint token
  console.log("\n[1/8] Minting OAuth token…");
  const tr = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(cfg.clientId)}&client_secret=${encodeURIComponent(cfg.clientSecret)}`,
  });
  if (!tr.ok) {
    console.error(`  FAIL ${tr.status} ${await tr.text()}`);
    return;
  }
  const tj = (await tr.json()) as { access_token: string; expires_in: number };
  const token = tj.access_token;
  console.log(`  OK — token expires in ${tj.expires_in}s`);

  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "IM-CustomerNumber": cfg.customerNumber,
    "IM-CountryCode": "US",
  };

  async function probe(label: string, path: string) {
    const correlationId = randomUUID();
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { ...baseHeaders, "IM-CorrelationID": correlationId },
    });
    const body = await r.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body.slice(0, 200);
    }
    return { label, path, status: r.status, body: parsed };
  }

  const results = await Promise.all([
    probe("Reseller: invoices (1)", "/resellers/v6/invoices?pageSize=1"),
    probe(
      "Reseller: invoices (2026)",
      "/resellers/v6/invoices?pageSize=5&invoiceFromDate=2026-05-01&invoiceToDate=2026-06-09",
    ),
    probe("Reseller: orders (1)", "/resellers/v6/orders?pageSize=1"),
    probe(
      "Reseller: orders (2026)",
      "/resellers/v6/orders?pageSize=5&orderCreatedFromDate=2026-05-01&orderCreatedToDate=2026-06-09",
    ),
    probe("Reseller: renewals", "/resellers/v6/renewals?pageSize=5"),
    probe(
      "CMP: subscriptions (M365)",
      "/resellers/v6/subscriptions/microsoft?pageSize=5",
    ),
    probe(
      "CMP: subscriptions (all)",
      "/resellers/v6/subscriptions?pageSize=5",
    ),
    probe("CMP: customers", "/resellers/v6/customers?pageSize=5"),
  ]);

  console.log("\n=== Endpoint probe results ===\n");
  for (const r of results) {
    const ok = r.status >= 200 && r.status < 300;
    const tag = ok ? "✓" : "✗";
    console.log(`${tag} [${r.status}] ${r.label}`);
    console.log(`    ${r.path}`);
    if (ok && r.body && typeof r.body === "object") {
      const b = r.body as Record<string, unknown>;
      const recordCount =
        (b.recordsFound as number | undefined) ??
        (b.totalRecords as number | undefined);
      const arr =
        (b.invoices as unknown[] | undefined) ??
        (b.orders as unknown[] | undefined) ??
        (b.subscriptions as unknown[] | undefined) ??
        (b.renewals as unknown[] | undefined) ??
        (b.customers as unknown[] | undefined);
      if (recordCount != null) console.log(`    recordsFound: ${recordCount}`);
      if (arr) console.log(`    returned: ${arr.length} item(s)`);
      // First item keys give a sense of shape
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0] as Record<string, unknown>;
        console.log(
          `    item[0] keys: ${Object.keys(first).slice(0, 14).join(", ")}`,
        );
      }
    } else if (!ok) {
      const errBody =
        typeof r.body === "object"
          ? JSON.stringify(r.body).slice(0, 200)
          : String(r.body).slice(0, 200);
      console.log(`    error: ${errBody}`);
    }
    console.log();
  }

  // Pull one invoice with full detail to see what's available per-invoice
  const oneInvoice = results.find(
    (r) =>
      r.label === "Reseller: invoices (2026)" &&
      r.status >= 200 &&
      r.status < 300,
  );
  if (
    oneInvoice &&
    typeof oneInvoice.body === "object" &&
    oneInvoice.body !== null
  ) {
    const inv = (oneInvoice.body as { invoices?: unknown[] }).invoices?.[0] as
      | Record<string, unknown>
      | undefined;
    if (inv) {
      console.log("=== Sample invoice (May–June 2026 window, first match) ===");
      console.log(JSON.stringify(inv, null, 2).slice(0, 2000));
      console.log();
      const invNum = inv.invoiceNumber as string | undefined;
      if (invNum) {
        console.log(`Pulling detail for invoice ${invNum}…`);
        const det = await probe(
          "Reseller: invoice detail",
          `/resellers/v6/invoices/${invNum}`,
        );
        console.log(
          `  [${det.status}] keys: ${typeof det.body === "object" && det.body ? Object.keys(det.body as Record<string, unknown>).slice(0, 20).join(", ") : "(non-object)"}`,
        );
        if (typeof det.body === "object" && det.body) {
          const detObj = det.body as Record<string, unknown>;
          const lines = (detObj.Lines ??
            detObj.lines ??
            detObj.invoiceLines ??
            detObj.lineDetails) as unknown[] | undefined;
          if (Array.isArray(lines)) {
            console.log(`  line items: ${lines.length}`);
            if (lines.length > 0) {
              console.log(
                `  line[0] keys: ${Object.keys(lines[0] as Record<string, unknown>).join(", ")}`,
              );
              console.log(
                `  line[0] sample:\n${JSON.stringify(lines[0], null, 2).slice(0, 1500)}`,
              );
            }
          }
          // Also probe BillTo / ShipTo / EndUser shape
          const bill = detObj.BillToInfo;
          const ship = detObj.ShipToInfo;
          const enduser = detObj.EndUserInfo;
          const summary = detObj.Summary;
          if (bill) console.log(`  BillToInfo keys: ${Object.keys(bill as Record<string, unknown>).join(", ")}`);
          if (ship) console.log(`  ShipToInfo keys: ${Object.keys(ship as Record<string, unknown>).join(", ")}`);
          if (enduser) console.log(`  EndUserInfo keys: ${Object.keys(enduser as Record<string, unknown>).join(", ")}`);
          if (summary) {
            console.log(`  Summary keys: ${Object.keys(summary as Record<string, unknown>).join(", ")}`);
            console.log(`  Summary sample: ${JSON.stringify(summary).slice(0, 400)}`);
          }
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
