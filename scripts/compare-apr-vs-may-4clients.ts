/**
 * Side-by-side comparison: April 2026 actual invoice vs May 2026
 * dry-run preview for AHP, Collision Leaders, Medify, Black Slate
 * Partners. Read-only.
 *
 *   pnpm exec tsx scripts/compare-apr-vs-may-4clients.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const TARGETS = ["AHP", "Collision Leaders", "Medify", "Black Slate Partners"];

function fmtUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function pad(s: string, n: number) {
  return s.padEnd(n).slice(0, n);
}

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    clients,
    invoiceLines,
    invoices,
    organizations,
  } = await import("../src/db/schema");
  const { previewPsMonthlyInvoice } = await import(
    "../src/lib/invoices/ps-monthly-orchestrator"
  );

  const org = await db.select().from(organizations).limit(1);
  const orgId = org[0].id;

  for (const name of TARGETS) {
    const c = await db
      .select()
      .from(clients)
      .where(
        and(eq(clients.organizationId, orgId), eq(clients.name, name)),
      )
      .limit(1);
    if (c.length === 0) {
      console.log(`\n=== ${name}: NOT FOUND ===`);
      continue;
    }
    const cl = c[0];

    // April invoice lines
    const apr = await db
      .select({
        invoice: invoices,
        line: invoiceLines,
      })
      .from(invoices)
      .innerJoin(invoiceLines, eq(invoiceLines.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.organizationId, orgId),
          eq(invoices.clientId, cl.id),
          eq(invoices.periodStart, "2026-04-01"),
        ),
      )
      .orderBy(invoiceLines.position);

    // May dry-run
    const may = await previewPsMonthlyInvoice({
      organizationId: orgId,
      clientId: cl.id,
      yyyymm: "2026-05",
    });

    console.log(`\n${"═".repeat(98)}`);
    console.log(`  ${name}`);
    console.log(`${"═".repeat(98)}`);
    console.log(
      `  Contract rates configured: compute=${cl.supportRateFullComputeCents != null ? fmtUsd(cl.supportRateFullComputeCents) : "NULL"}` +
        `, BD=${cl.rebillRateBitdefenderCents != null ? fmtUsd(cl.rebillRateBitdefenderCents) : "default"}` +
        `, LG=${cl.rebillRateLiongardCents != null ? fmtUsd(cl.rebillRateLiongardCents) : "default"}` +
        `, TH=${cl.rebillRateTitanhqCents != null ? fmtUsd(cl.rebillRateTitanhqCents) : "default"}` +
        `, SR=${cl.rebillRateSyncroRemoteCents != null ? fmtUsd(cl.rebillRateSyncroRemoteCents) : "default"}`,
    );

    console.log(`\n  APRIL 2026 (actual, invoice ${apr[0]?.invoice?.invoiceNumber ?? "—"})`);
    console.log(`  ${"─".repeat(95)}`);
    console.log(
      `  ${pad("Description", 50)} ${pad("Qty", 6).padStart(6)} ${pad("Rate", 12).padStart(12)} ${pad("Amount", 12).padStart(12)}`,
    );
    let aprSubtotal = 0;
    for (const r of apr) {
      const line = r.line;
      aprSubtotal += line.amountCents;
      const desc =
        line.description?.trim() || line.sectionLabel || line.sku || "—";
      console.log(
        `  ${pad(desc, 50)} ${String(line.quantity).padStart(6)} ${fmtUsd(line.unitRateCents).padStart(12)} ${fmtUsd(line.amountCents).padStart(12)}`,
      );
    }
    console.log(`  ${"─".repeat(95)}`);
    console.log(
      `  ${pad("APRIL TOTAL", 50)} ${pad("", 6).padStart(6)} ${pad("", 12).padStart(12)} ${fmtUsd(aprSubtotal).padStart(12)}`,
    );

    console.log(
      `\n  MAY 2026 (dry-run, new PS format, ${may.lines.length} lines)`,
    );
    console.log(`  ${"─".repeat(95)}`);
    console.log(
      `  ${pad("SKU · Description", 50)} ${pad("Qty", 6).padStart(6)} ${pad("Rate", 12).padStart(12)} ${pad("Amount", 12).padStart(12)} src`,
    );
    // Group by SKU for clarity
    const bySku = new Map<
      string,
      { qty: number; rate: number; amount: number; source: string }
    >();
    for (const l of may.lines) {
      const key = `${l.sku ?? "—"} · ${l.description}`;
      const existing = bySku.get(key);
      if (existing) {
        existing.qty += l.quantity;
        existing.amount += l.amountCents;
      } else {
        bySku.set(key, {
          qty: l.quantity,
          rate: l.unitRateCents,
          amount: l.amountCents,
          source: l.rateSource ?? "?",
        });
      }
    }
    for (const [key, v] of bySku) {
      console.log(
        `  ${pad(key, 50)} ${String(v.qty).padStart(6)} ${fmtUsd(v.rate).padStart(12)} ${fmtUsd(v.amount).padStart(12)}  ${v.source}`,
      );
    }
    console.log(`  ${"─".repeat(95)}`);
    console.log(
      `  ${pad("MAY TOTAL", 50)} ${pad("", 6).padStart(6)} ${pad("", 12).padStart(12)} ${fmtUsd(may.totalCents).padStart(12)}`,
    );

    const delta = may.totalCents - aprSubtotal;
    const deltaPct = aprSubtotal ? (delta / aprSubtotal) * 100 : 0;
    console.log(
      `\n  Δ MoM: ${fmtUsd(delta)} (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`,
    );
  }

  console.log("\n" + "═".repeat(98));
  console.log("  KEY:");
  console.log("    src=client_support_rate   → uses clients.support_rate_full_compute_cents (set on client tab)");
  console.log("    src=client_rebill_rate    → uses clients.rebill_rate_<vendor>_cents (set on client tab)");
  console.log("    src=template_default      → falling back to hardcoded default — operator should set a rate");
  console.log("    src=license_row           → matched a row in licenses.rebill_rate_cents");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
