/**
 * May 2026 invoice batch dry-run.
 *
 * For every client that received an April 2026 invoice, run
 * previewPsMonthlyInvoice for May 2026 and produce a per-client report
 * showing:
 *
 *   • What lines would generate, per location
 *   • Expected May subtotal
 *   • Comparison vs April actual (delta in $ and %)
 *   • Flags: rate-source falling back to template default,
 *            zero-line clients, missing pricing
 *
 * NO database writes. Safe to run any number of times.
 *
 *   pnpm exec tsx scripts/may-2026-invoice-dryrun.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// IMPORTANT: src/db reads DATABASE_URL at module-import time, so all
// app-module imports happen INSIDE main() via dynamic import after
// dotenv has populated process.env. Static imports at the top of this
// file would run before dotenv finishes and blow up.

const TARGET_MONTH = "2026-05";
const REFERENCE_MONTH_START = "2026-04-01";

type ClientSummary = {
  clientId: string;
  clientName: string;
  aprilTotalCents: number;
  aprilLineCount: number;
  mayLineCount: number;
  maySubtotalCents: number;
  mayTotalCents: number;
  deltaCents: number;
  deltaPct: number;
  rateSources: Record<string, number>;
  perProduct: Record<string, { qty: number; cents: number }>;
  perLocation: Record<string, { lines: number; cents: number }>;
  flags: string[];
};

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { clients, invoices, organizations } = await import(
    "../src/db/schema"
  );
  const { previewPsMonthlyInvoice } = await import(
    "../src/lib/invoices/ps-monthly-orchestrator"
  );

  const org = await db.select().from(organizations).limit(1);
  if (org.length === 0) throw new Error("No organization rows");
  const orgId = org[0].id;
  console.log(`Org: ${org[0].name} (${orgId})`);
  console.log(`Dry-run for ${TARGET_MONTH}\n`);

  // Pull clients that had an April invoice — the natural set for May.
  const aprilInvs = await db
    .select({
      clientId: invoices.clientId,
      invoiceId: invoices.id,
      totalCents: invoices.totalCents,
      lineCount: sql<number>`(
        select count(*)::int from invoice_lines il
         where il.invoice_id = ${invoices.id}
      )`,
      clientName: clients.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.organizationId, orgId),
        eq(invoices.periodStart, REFERENCE_MONTH_START),
        eq(invoices.kind, "monthly_contract"),
      ),
    )
    .orderBy(clients.name);
  console.log(`${aprilInvs.length} clients had an April invoice — generating May previews…\n`);

  const summaries: ClientSummary[] = [];

  for (const apr of aprilInvs) {
    process.stdout.write(`  ${apr.clientName.padEnd(40)} `);
    try {
      const draft = await previewPsMonthlyInvoice({
        organizationId: orgId,
        clientId: apr.clientId,
        yyyymm: TARGET_MONTH,
      });
      const rateSources: Record<string, number> = {};
      const perProduct: Record<string, { qty: number; cents: number }> = {};
      const perLocation: Record<string, { lines: number; cents: number }> = {};
      for (const ln of draft.lines) {
        rateSources[ln.rateSource] = (rateSources[ln.rateSource] ?? 0) + 1;
        perProduct[ln.sku] = perProduct[ln.sku] ?? { qty: 0, cents: 0 };
        perProduct[ln.sku].qty += ln.quantity;
        perProduct[ln.sku].cents += ln.amountCents;
        const locKey = ln.locationId ?? "(no-location)";
        perLocation[locKey] = perLocation[locKey] ?? { lines: 0, cents: 0 };
        perLocation[locKey].lines += 1;
        perLocation[locKey].cents += ln.amountCents;
      }

      const flags: string[] = [];
      if (draft.lines.length === 0) flags.push("ZERO_LINES");
      if (rateSources["template_default"] > 0)
        flags.push(`USING_DEFAULTS(${rateSources["template_default"]})`);
      const deltaCents = draft.totalCents - apr.totalCents;
      const deltaPct = apr.totalCents
        ? (deltaCents / apr.totalCents) * 100
        : 0;
      if (Math.abs(deltaPct) > 10) flags.push(`MOM_DELTA_${deltaPct.toFixed(0)}%`);

      summaries.push({
        clientId: apr.clientId,
        clientName: apr.clientName,
        aprilTotalCents: apr.totalCents,
        aprilLineCount: apr.lineCount,
        mayLineCount: draft.lines.length,
        maySubtotalCents: draft.subtotalCents,
        mayTotalCents: draft.totalCents,
        deltaCents,
        deltaPct,
        rateSources,
        perProduct,
        perLocation,
        flags,
      });
      console.log(
        `${fmtUsd(draft.totalCents).padStart(12)}  (${draft.lines.length} lines, Δ ${deltaPct.toFixed(1)}%)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg.slice(0, 100)}`);
      summaries.push({
        clientId: apr.clientId,
        clientName: apr.clientName,
        aprilTotalCents: apr.totalCents,
        aprilLineCount: apr.lineCount,
        mayLineCount: 0,
        maySubtotalCents: 0,
        mayTotalCents: 0,
        deltaCents: -apr.totalCents,
        deltaPct: -100,
        rateSources: {},
        perProduct: {},
        perLocation: {},
        flags: [`ERROR:${msg.slice(0, 80)}`],
      });
    }
  }

  /* ============================== Report ============================== */
  console.log("\n=== MAY 2026 DRY-RUN REPORT ===\n");

  const totalApril = summaries.reduce((a, s) => a + s.aprilTotalCents, 0);
  const totalMay = summaries.reduce((a, s) => a + s.mayTotalCents, 0);
  const overallDelta = totalMay - totalApril;
  console.log(
    `Overall: April ${fmtUsd(totalApril)}  →  May ${fmtUsd(totalMay)}  (Δ ${fmtUsd(overallDelta)} / ${((overallDelta / totalApril) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Clients: ${summaries.length} total — ${summaries.filter((s) => s.flags.length === 0).length} clean, ${summaries.filter((s) => s.flags.length > 0).length} flagged`,
  );

  console.log("\n--- Per-client breakdown ---");
  console.log(
    "Client                                   April $       May $       Δ%      Flags",
  );
  console.log("─".repeat(110));
  for (const s of summaries) {
    const flagStr = s.flags.length > 0 ? s.flags.join(", ") : "OK";
    console.log(
      `${s.clientName.padEnd(40)} ${fmtUsd(s.aprilTotalCents).padStart(11)} ${fmtUsd(s.mayTotalCents).padStart(11)} ${(s.deltaPct).toFixed(1).padStart(7)}%  ${flagStr}`,
    );
  }

  console.log("\n--- Per-product totals across all clients (May) ---");
  const byProduct: Record<string, { qty: number; cents: number }> = {};
  for (const s of summaries) {
    for (const [sku, v] of Object.entries(s.perProduct)) {
      byProduct[sku] = byProduct[sku] ?? { qty: 0, cents: 0 };
      byProduct[sku].qty += v.qty;
      byProduct[sku].cents += v.cents;
    }
  }
  for (const [sku, v] of Object.entries(byProduct).sort(
    (a, b) => b[1].cents - a[1].cents,
  )) {
    console.log(
      `  ${sku.padEnd(35)}  qty ${String(v.qty).padStart(5)}  ${fmtUsd(v.cents).padStart(12)}`,
    );
  }

  console.log("\n--- Rate-source distribution ---");
  const rs: Record<string, number> = {};
  for (const s of summaries) {
    for (const [k, v] of Object.entries(s.rateSources)) {
      rs[k] = (rs[k] ?? 0) + v;
    }
  }
  for (const [k, v] of Object.entries(rs).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(25)}  ${v} lines`);
  }

  console.log("\n--- Flagged clients (need review) ---");
  const flagged = summaries.filter((s) => s.flags.length > 0);
  if (flagged.length === 0) {
    console.log("  None — all 18 are clean.");
  } else {
    for (const s of flagged) {
      console.log(`  • ${s.clientName}: ${s.flags.join(", ")}`);
    }
  }

  console.log("\nDone. No DB writes. To generate for real, use /finance/invoices Run Monthly Batch with month=2026-05.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
