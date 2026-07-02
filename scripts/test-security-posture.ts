/**
 * Smoke-test: derive security posture for a handful of clients and
 * dump the auto-suggested answers so we can sanity-check the
 * heuristics before letting operators rely on them.
 *
 *   pnpm exec tsx scripts/test-security-posture.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const TARGETS = ["AHP", "Collision Leaders", "Medify", "Bestige Holdings"];

async function main() {
  const { eq, and } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { clients, organizations } = await import("../src/db/schema");
  const { derivePostureForClient } = await import(
    "../src/lib/security-review/derive-posture"
  );
  const { SECURITY_QUESTIONS } = await import(
    "../src/lib/security-review/checklist"
  );

  const org = await db.select().from(organizations).limit(1);
  const orgId = org[0].id;

  for (const name of TARGETS) {
    const c = await db
      .select()
      .from(clients)
      .where(and(eq(clients.organizationId, orgId), eq(clients.name, name)))
      .limit(1);
    if (c.length === 0) {
      console.log(`\n${name}: NOT FOUND`);
      continue;
    }
    console.log(`\n${"═".repeat(80)}`);
    console.log(`  ${name}`);
    console.log(`${"═".repeat(80)}`);
    const p = await derivePostureForClient({
      organizationId: orgId,
      clientId: c[0].id,
    });
    console.log(`  Active endpoints: ${p.totalActiveEndpoints}`);
    console.log(
      `  Entra joined:     ${p.endpointsEntraJoined}/${p.totalActiveEndpoints}`,
    );
    console.log(
      `  Intune enrolled:  ${p.endpointsIntuneEnrolled}/${p.totalActiveEndpoints}`,
    );
    console.log(
      `  EDR deployed:     ${p.endpointsWithEdr}/${p.totalActiveEndpoints}`,
    );
    console.log(
      `  Win11 eligible:   ${p.endpointsWin11Eligible} | not eligible: ${p.endpointsWin11NotEligible} | partial: ${p.endpointsWin11Partial}`,
    );
    console.log(`  EDR products:     ${p.edrProducts.join(", ") || "—"}`);
    console.log(`  RMM products:     ${p.rmmProducts.join(", ") || "—"}`);
    console.log(`  Backup products:  ${p.backupProducts.join(", ") || "—"}`);
    console.log(`  TitanHQ mailboxes: ${p.titanhqActiveMailboxes}`);
    console.log(
      `  M365 tier:        ${p.m365Tier ?? "—"} (${p.m365LicenseCount} licenses)`,
    );

    console.log(`\n  Suggested answers (auto-populated):`);
    for (const q of SECURITY_QUESTIONS) {
      const a = p.suggested[q.id];
      const indicator =
        a.status === "yes"
          ? "✓"
          : a.status === "partial"
            ? "~"
            : a.status === "no"
              ? "✗"
              : "·";
      const auto = a.autoFilled ? "[auto]" : "[manual]";
      console.log(
        `    ${indicator} ${q.id.padEnd(32)} ${a.status.padEnd(8)} ${auto.padEnd(9)} ${a.detail}`,
      );
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
