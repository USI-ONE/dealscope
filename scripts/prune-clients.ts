/**
 * Prune the TechOS client roster down to the user-specified keep list.
 *
 * Defaults to DRY-RUN. Pass --apply to actually delete.
 *
 *   pnpm exec tsx scripts/prune-clients.ts                # preview
 *   pnpm exec tsx scripts/prune-clients.ts --apply        # commit
 *
 * Cascade behavior (per schema):
 *   clientContacts, clientLocations, hardware, services, licenses,
 *   contracts, licenseAssignments → ON DELETE CASCADE (deleted with client)
 *   billables → ON DELETE RESTRICT (would block; we have none yet, but check)
 *   diligenceEngagements → ON DELETE SET NULL (engagements survive, link nulled)
 */
import { config as loadEnv } from "dotenv";
import { and, eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const ORG_SLUG = process.env.TECHOS_DEFAULT_ORG_SLUG ?? "usi";

/**
 * Keep-list. Each rule has a regex matched against the client.name
 * (case-insensitive) and an optional `rename` to update the name +
 * regenerate the slug.
 */
const KEEP_RULES: { match: RegExp; rename?: string }[] = [
  { match: /^bestige holdings$/i },
  { match: /^ahp$/i },
  { match: /^medimorph$/i, rename: "Medify" },
  { match: /^black slate partners$/i },
  { match: /^outdoor expressions$/i },
  { match: /^aladdin( skylights)?$/i },
  { match: /^cardiaspace$/i },
  { match: /^collision leaders$/i },
  { match: /^e-?corp$/i },
  { match: /^guardian$/i },
  { match: /^g54$/i },
  { match: /^industrial injection$/i },
  { match: /^nest laundry$/i },
  { match: /^rico brands?$/i },
  { match: /^rocky mountain emergency vehicle$/i },
  { match: /^rosing,?\s*davidson\s*&\s*frost$/i },
  { match: /^taylor built homes$/i },
  { match: /^universal systems( inc\.?)?$/i },
  { match: /^urgent access$/i },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "client";

async function main() {
  console.log(`mode: ${APPLY ? "APPLY (writes!)" : "DRY-RUN"} · org: ${ORG_SLUG}\n`);

  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, ORG_SLUG),
  });
  if (!org) throw new Error(`No org "${ORG_SLUG}"`);

  const all = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.organizationId, org.id));

  const keep: { id: string; name: string; renameTo?: string }[] = [];
  const drop: { id: string; name: string }[] = [];
  const matchedRules = new Set<RegExp>();

  for (const c of all) {
    const rule = KEEP_RULES.find((r) => r.match.test(c.name.trim()));
    if (rule) {
      keep.push({ id: c.id, name: c.name, renameTo: rule.rename });
      matchedRules.add(rule.match);
    } else {
      drop.push({ id: c.id, name: c.name });
    }
  }

  // Surface any keep-rules that didn't match any client — usually means a typo.
  const unmatchedRules = KEEP_RULES.filter((r) => !matchedRules.has(r.match));

  console.log("--- KEEP ---");
  for (const k of keep) {
    console.log(
      `  ${k.name.padEnd(45)}${k.renameTo ? `  → rename to "${k.renameTo}"` : ""}`,
    );
  }
  console.log(`  (${keep.length} kept)\n`);

  console.log("--- DELETE ---");
  for (const d of drop) console.log(`  ${d.name}`);
  console.log(`  (${drop.length} to delete)\n`);

  if (unmatchedRules.length) {
    console.log("--- KEEP-RULES THAT DIDN'T MATCH ANY CLIENT ---");
    for (const r of unmatchedRules) console.log(`  ${r.match}`);
    console.log("");
  }

  // Hardware / contacts / locations counts that will cascade-delete.
  const dropIds = drop.map((d) => d.id);
  if (dropIds.length) {
    const [hwCount, contactCount, locCount, licCount, svcCount, contractCount] =
      await Promise.all([
        db
          .select({ id: schema.hardware.id })
          .from(schema.hardware)
          .where(inArray(schema.hardware.clientId, dropIds))
          .then((r) => r.length),
        db
          .select({ id: schema.clientContacts.id })
          .from(schema.clientContacts)
          .where(inArray(schema.clientContacts.clientId, dropIds))
          .then((r) => r.length),
        db
          .select({ id: schema.clientLocations.id })
          .from(schema.clientLocations)
          .where(inArray(schema.clientLocations.clientId, dropIds))
          .then((r) => r.length),
        db
          .select({ id: schema.licenses.id })
          .from(schema.licenses)
          .where(inArray(schema.licenses.clientId, dropIds))
          .then((r) => r.length),
        db
          .select({ id: schema.services.id })
          .from(schema.services)
          .where(inArray(schema.services.clientId, dropIds))
          .then((r) => r.length),
        db
          .select({ id: schema.contracts.id })
          .from(schema.contracts)
          .where(inArray(schema.contracts.clientId, dropIds))
          .then((r) => r.length),
      ]);
    console.log(
      `Cascade impact: ${hwCount} hardware · ${contactCount} contacts · ${locCount} locations · ${licCount} licenses · ${svcCount} services · ${contractCount} contracts\n`,
    );

    // Billables guard — restrict cascade.
    const billablesBlocked = await db
      .select({ id: schema.billables.id })
      .from(schema.billables)
      .where(inArray(schema.billables.clientId, dropIds));
    if (billablesBlocked.length > 0) {
      console.error(
        `❌ ${billablesBlocked.length} billable rows reference clients in the delete list — DB will REFUSE the delete (ON DELETE RESTRICT). Resolve first.`,
      );
      await c.end();
      process.exit(1);
    }
  }

  if (!APPLY) {
    console.log("Dry-run complete. Re-run with --apply to commit.");
    await c.end();
    return;
  }

  // ---- APPLY ----
  console.log("Applying...");
  // 1. Renames first.
  for (const k of keep) {
    if (!k.renameTo) continue;
    await db
      .update(schema.clients)
      .set({
        name: k.renameTo,
        slug: slugify(k.renameTo),
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, k.id));
    console.log(`  renamed: ${k.name} → ${k.renameTo}`);
  }
  // 2. Deletes.
  if (dropIds.length) {
    const result = await db
      .delete(schema.clients)
      .where(
        and(
          eq(schema.clients.organizationId, org.id),
          inArray(schema.clients.id, dropIds),
        ),
      )
      .returning({ id: schema.clients.id, name: schema.clients.name });
    console.log(`  deleted: ${result.length} client(s)`);
  }

  // Final state.
  const finalCount = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.organizationId, org.id));
  console.log(`\nFinal client count: ${finalCount.length}`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
