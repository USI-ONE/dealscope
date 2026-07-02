/**
 * Ship May 2026 invoices for the 6 confirmed-rate clients:
 *
 *   AHP, Black Slate Partners, Collision Leaders, Industrial Injection,
 *   Medify, Outdoor Expressions.
 *
 * Steps per client:
 *   1. Set rebill_rate_<vendor>_cents to USI's standard rate card
 *      (BD $10, Liongard $3, TitanHQ $3.50, Syncro Remote $6) so the
 *      data is consistent for future months — these rates are not
 *      client-specific (no negotiated discount). Keeping the existing
 *      support_rate_full_compute_cents already on each client untouched.
 *   2. Void any non-void monthly_contract invoice already in 2026-05
 *      for that client (idempotent re-run).
 *   3. Call generatePsMonthlyInvoice — writes invoice + per-location
 *      lines into invoices + invoice_lines, status='draft'.
 *
 * Drafts land at /finance/invoices for review before sending.
 *
 *   pnpm exec tsx scripts/generate-may-six-clients.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const TARGET_CLIENTS = [
  "AHP",
  "Black Slate Partners",
  "Collision Leaders",
  "Industrial Injection",
  "Medify",
  "Outdoor Expressions",
];

const MONTH = "2026-05";

// USI standard rate card for the new third-party rebill lines. These
// match the template defaults in src/lib/invoices/ps-product-templates.ts
// but writing them explicitly per-client means the billing page +
// every future month renders identically without surprise fallbacks.
const STANDARD_REBILL_CENTS = {
  bitdefender: 1000, // $10
  liongard: 300, //    $3
  titanhq: 350, //     $3.50
  syncroRemote: 600, // $6
};

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

async function main() {
  const { and, eq, inArray, ne } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { clients, invoices, organizations } = await import("../src/db/schema");
  const { generatePsMonthlyInvoice } = await import(
    "../src/lib/invoices/ps-monthly-orchestrator"
  );

  const org = await db.select().from(organizations).limit(1);
  const orgId = org[0].id;
  console.log(`Org: ${org[0].name} (${orgId})`);

  // Load the 6 target clients.
  const clientRows = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.organizationId, orgId), inArray(clients.name, TARGET_CLIENTS)),
    );
  if (clientRows.length !== TARGET_CLIENTS.length) {
    const got = new Set(clientRows.map((c) => c.name));
    const missing = TARGET_CLIENTS.filter((n) => !got.has(n));
    throw new Error(`Couldn't find clients: ${missing.join(", ")}`);
  }

  // Step 1: set rebill rates on each client (only the third-party ones —
  // leave support_rate_full_compute_cents alone).
  console.log("\nStep 1 — setting standard rebill rates on 6 clients");
  await db
    .update(clients)
    .set({
      rebillRateBitdefenderCents: STANDARD_REBILL_CENTS.bitdefender,
      rebillRateLiongardCents: STANDARD_REBILL_CENTS.liongard,
      rebillRateTitanhqCents: STANDARD_REBILL_CENTS.titanhq,
      rebillRateSyncroRemoteCents: STANDARD_REBILL_CENTS.syncroRemote,
      updatedAt: new Date(),
    })
    .where(
      and(eq(clients.organizationId, orgId), inArray(clients.name, TARGET_CLIENTS)),
    );
  console.log(
    `  BD=${fmtUsd(STANDARD_REBILL_CENTS.bitdefender)}, LG=${fmtUsd(STANDARD_REBILL_CENTS.liongard)}, TH=${fmtUsd(STANDARD_REBILL_CENTS.titanhq)}, SR=${fmtUsd(STANDARD_REBILL_CENTS.syncroRemote)}`,
  );

  // Step 2: void any non-void May 2026 invoices already in flight.
  console.log("\nStep 2 — voiding any existing May 2026 invoices");
  for (const c of clientRows) {
    const r = await db
      .update(invoices)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidReason: "Replaced by fresh generation 2026-06-02",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.organizationId, orgId),
          eq(invoices.clientId, c.id),
          eq(invoices.periodStart, `${MONTH}-01`),
          eq(invoices.kind, "monthly_contract"),
          ne(invoices.status, "void"),
        ),
      )
      .returning({ id: invoices.id });
    if (r.length > 0) {
      console.log(`  ${c.name}: voided ${r.length} prior invoice(s)`);
    }
  }

  // Step 3: generate fresh PS invoices.
  console.log(`\nStep 3 — generating fresh ${MONTH} invoices`);
  const results: Array<{
    client: string;
    invoiceNumber: string;
    totalCents: number;
    status: "created" | "no_lines" | "already_exists";
  }> = [];
  for (const c of clientRows) {
    const r = await generatePsMonthlyInvoice({
      organizationId: orgId,
      clientId: c.id,
      yyyymm: MONTH,
    });
    if (r.created) {
      results.push({
        client: c.name,
        invoiceNumber: r.invoiceNumber,
        totalCents: r.totalCents,
        status: "created",
      });
      console.log(
        `  ✓ ${c.name.padEnd(30)} ${r.invoiceNumber}   ${fmtUsd(r.totalCents)}`,
      );
    } else {
      console.log(`  ✗ ${c.name.padEnd(30)} skipped: ${r.reason}`);
      results.push({
        client: c.name,
        invoiceNumber: "—",
        totalCents: 0,
        status: r.reason,
      });
    }
  }

  const created = results.filter((r) => r.status === "created");
  const totalCents = created.reduce((s, r) => s + r.totalCents, 0);

  console.log(`\n${"═".repeat(70)}`);
  console.log(
    `  Created ${created.length} invoices, total ${fmtUsd(totalCents)}`,
  );
  console.log(`${"═".repeat(70)}`);
  console.log("\nNext: open /finance/invoices and review the drafts.");
  console.log(
    "Each one stays in status='draft' until you mark it sent — nothing has been emailed.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
