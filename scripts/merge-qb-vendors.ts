/**
 * One-shot: import / enrich vendors from the QuickBooks IIF-format CSV.
 *
 *   pnpm exec tsx scripts/merge-qb-vendors.ts "/c/Users/CWall/Downloads/quickbooks files usi.csv"
 *
 * Behavior:
 *  - Parses the !VEND header + VEND rows from the file.
 *  - For each unique vendor (deduped by normalized name):
 *      • Match an existing TechOS vendor by qbVendorName, slug, or
 *        case-insensitive name.
 *      • If matched: ENRICH only — fill any empty contact / phone /
 *        email / notes fields. Never overwrite a non-empty value.
 *        Always set qbVendorName so QB IIF export round-trips cleanly.
 *      • If not matched: INSERT a new vendor.
 *  - Reports created / enriched / skipped counts.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import fs from "fs";
import path from "path";
import { Client } from "pg";
import { parseCsv } from "../src/lib/csv/parse";

const ORG_NAME = "Universal Systems Inc";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/[\s.,'"&]+/g, "");

/**
 * Extract just the VEND section from the QB CSV. Returns a clean CSV
 * string with a header line + only the data rows.
 */
function extractVendBlock(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.startsWith("!VEND,")) {
      inBlock = true;
      // Strip "!VEND," from header so columns line up with data rows
      // (which we'll also strip "VEND," from below). Header now reads
      // "NAME,REFNUM,TIMESTAMP,..." matching data "1000Bulbs,11990,...".
      out.push(line.slice("!VEND,".length));
      continue;
    }
    if (!inBlock) continue;
    if (line.startsWith("!")) break; // next section
    if (line.startsWith("VEND,")) {
      out.push(line.slice("VEND,".length));
    }
  }
  return out.join("\n");
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: merge-qb-vendors.ts <path-to-csv>");
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(csvPath, "utf8");
  const vendBlock = extractVendBlock(raw);
  if (!vendBlock) {
    console.error("No !VEND section found in file.");
    process.exit(1);
  }

  const parsed = parseCsv(vendBlock);
  console.log(
    `Parsed ${parsed.rows.length} vendor rows from ${path.basename(csvPath)}.`,
  );

  // Map each parsed row to our vendor shape. Many QB columns we ignore.
  type Incoming = {
    qbName: string;
    name: string;
    slug: string;
    primaryContactName: string | null;
    primaryContactPhone: string | null;
    primaryContactEmail: string | null;
    accountNumber: string | null;
    website: string | null;
    notes: string | null;
  };

  const rawIncoming: Incoming[] = parsed.rows
    .map((r) => {
      const qbName = (r.NAME ?? "").trim();
      if (!qbName) return null;
      // Prefer COMPANYNAME if set (more formal); else NAME / PRINTAS.
      const displayName =
        (r.COMPANYNAME ?? "").trim() || (r.PRINTAS ?? "").trim() || qbName;
      const personFirst = (r.FIRSTNAME ?? "").trim();
      const personLast = (r.LASTNAME ?? "").trim();
      const personName = [personFirst, personLast].filter(Boolean).join(" ").trim();
      const cont1 = (r.CONT1 ?? "").trim();
      const note = (r.NOTE ?? "").trim();
      const notePad = (r.NOTEPAD ?? "").trim();
      // Combine note + notepad + terms hints (those last two are often
      // multi-line with embedded "\n" literals from QB).
      const noteCombined = [
        note,
        notePad && notePad !== note ? notePad : null,
        (r.TERMS ?? "").trim() ? `Terms: ${(r.TERMS ?? "").trim()}` : null,
        (r.TAXID ?? "").trim() ? `Tax ID: ${(r.TAXID ?? "").trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n\n")
        .replace(/\\n/g, "\n")
        .trim();
      return {
        qbName,
        name: displayName,
        slug: slugify(displayName) || slugify(qbName) || `qb-${qbName}`,
        primaryContactName: cont1 || personName || null,
        primaryContactPhone:
          (r.PHONE1 ?? "").trim() || (r.PHONE2 ?? "").trim() || null,
        primaryContactEmail: (r.EMAIL ?? "").trim() || null,
        accountNumber: null,
        website: null,
        notes: noteCombined || null,
      } as Incoming;
    })
    .filter((x): x is Incoming => x !== null);

  // De-dupe within the import file by normalized display name. Prefer
  // the row with the most data filled.
  const incomingByKey = new Map<string, Incoming>();
  for (const r of rawIncoming) {
    const key = norm(r.name);
    const existing = incomingByKey.get(key);
    if (!existing) {
      incomingByKey.set(key, r);
      continue;
    }
    // Pick whichever has more fields filled.
    const score = (x: Incoming) =>
      (x.primaryContactName ? 1 : 0) +
      (x.primaryContactPhone ? 1 : 0) +
      (x.primaryContactEmail ? 1 : 0) +
      (x.notes ? 1 : 0);
    if (score(r) > score(existing)) incomingByKey.set(key, r);
  }
  const incoming = [...incomingByKey.values()];
  console.log(
    `${incoming.length} unique vendors after de-duping by display name.\n`,
  );

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const orgRow = await c.query<{ id: string }>(
    `SELECT id FROM organizations WHERE name = $1 LIMIT 1`,
    [ORG_NAME],
  );
  if (orgRow.rows.length === 0) throw new Error(`Org "${ORG_NAME}" not found`);
  const orgId = orgRow.rows[0].id;

  // Pre-load existing vendors for fast match.
  const existing = await c.query<{
    id: string;
    name: string;
    slug: string;
    primary_contact_name: string | null;
    primary_contact_phone: string | null;
    primary_contact_email: string | null;
    notes: string | null;
    qb_vendor_name: string | null;
  }>(
    `SELECT id, name, slug,
            primary_contact_name, primary_contact_phone, primary_contact_email,
            notes, qb_vendor_name
       FROM vendors WHERE organization_id = $1`,
    [orgId],
  );
  const byNormName = new Map(existing.rows.map((v) => [norm(v.name), v]));
  const bySlug = new Map(existing.rows.map((v) => [v.slug, v]));
  const byQbName = new Map(
    existing.rows
      .filter((v) => v.qb_vendor_name)
      .map((v) => [norm(v.qb_vendor_name!), v] as const),
  );

  let created = 0;
  let enriched = 0;
  let unchanged = 0;

  // Track slug collisions when inserting new vendors.
  const usedSlugs = new Set(existing.rows.map((v) => v.slug));

  for (const inc of incoming) {
    const incNormName = norm(inc.name);
    const incNormQb = norm(inc.qbName);
    const match =
      byQbName.get(incNormQb) ??
      byNormName.get(incNormName) ??
      bySlug.get(inc.slug);

    if (match) {
      // ENRICH only — fill empty fields, set qbVendorName.
      const sets: string[] = [];
      const args: unknown[] = [];
      let i = 1;
      const push = (col: string, val: unknown) => {
        sets.push(`${col} = $${i++}`);
        args.push(val);
      };
      if (!match.qb_vendor_name) push("qb_vendor_name", inc.qbName);
      if (!match.primary_contact_name && inc.primaryContactName)
        push("primary_contact_name", inc.primaryContactName);
      if (!match.primary_contact_phone && inc.primaryContactPhone)
        push("primary_contact_phone", inc.primaryContactPhone);
      if (!match.primary_contact_email && inc.primaryContactEmail)
        push("primary_contact_email", inc.primaryContactEmail);
      if (!match.notes && inc.notes) push("notes", inc.notes);
      if (sets.length === 0) {
        unchanged++;
        continue;
      }
      sets.push(`updated_at = NOW()`);
      args.push(match.id);
      await c.query(
        `UPDATE vendors SET ${sets.join(", ")} WHERE id = $${i}`,
        args,
      );
      enriched++;
    } else {
      // INSERT new. Resolve slug collisions deterministically.
      let slug = inc.slug;
      if (usedSlugs.has(slug)) {
        let n = 2;
        while (usedSlugs.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
      usedSlugs.add(slug);
      await c.query(
        `INSERT INTO vendors
           (organization_id, name, slug, status,
            primary_contact_name, primary_contact_phone, primary_contact_email,
            qb_vendor_name, notes, tags)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, '[]'::jsonb)`,
        [
          orgId,
          inc.name,
          slug,
          inc.primaryContactName,
          inc.primaryContactPhone,
          inc.primaryContactEmail,
          inc.qbName,
          inc.notes,
        ],
      );
      created++;
    }
  }

  console.log(`Created : ${created}`);
  console.log(`Enriched: ${enriched}`);
  console.log(`Skipped : ${unchanged} (already complete)`);

  const total = await c.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM vendors WHERE organization_id = $1`,
    [orgId],
  );
  console.log(`\nTotal vendors in TechOS now: ${total.rows[0].n}`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
