/**
 * One-shot: import the legacy Joplin "TechOS-space-export" tree into
 * the client_pages wiki for each matching TechOS client.
 *
 *   pnpm exec tsx scripts/import-runbook-pages.ts /tmp/techos-export
 *
 * Behavior
 * ────────
 *  - Walks Clients/**.md (skipping Template.md).
 *  - Matches the top-level folder / filename to a TechOS client by
 *    normalized name with a small alias map for known renames.
 *  - For each file:
 *      • Strips Joplin HTML noise (data-id attrs, table wrappers,
 *        taskList markup) so the markdown is readable.
 *      • Determines kind from the path: Clients/X.md = overview,
 *        Clients/X/Locations/Y.md = location, .../Guides/Z.md =
 *        guide, anything else = note.
 *      • For 'location' pages, attempts to match an existing
 *        clientLocations row by label (case-insensitive).
 *      • Inserts (or refreshes) the client_pages row, idempotent on
 *        (client_id, source_path).
 *  - Resolves the parent_page_id in a second pass once every page
 *    has been inserted (so children can point at their overview/
 *    location parent).
 *
 * Reports created / updated / skipped with reasons.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import fs from "fs";
import path from "path";
import { Client } from "pg";

const ORG_NAME = "Universal Systems Inc";

/**
 * Known renames from the legacy Joplin export → TechOS canonical names.
 * Add more entries here if future imports need them.
 */
const CLIENT_ALIASES: Record<string, string> = {
  rmev: "Rocky Mountain Emergency Vehicle",
  guardianconstruction: "Guardian",
  rosingdavidson: "Rosing Davidson & Frost",
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120) || "untitled";

/**
 * Strip the worst Joplin-export noise so the body reads as clean
 * markdown. We don't try to be a perfect HTML-to-MD converter — just
 * remove the bulky wrappers and attribute clutter that get in the way.
 */
function cleanBody(raw: string): string {
  let body = raw;
  // Joplin wraps every editable table in <div class="joplin-table-wrapper">...
  // ...</div>. The content inside is a Joplin-generated HTML table that
  // doesn't render usefully in plain markdown. Drop the whole wrapper.
  body = body.replace(
    /<div class="joplin-table-wrapper">[\s\S]*?<\/table>\s*<\/div>/g,
    "_[Joplin table omitted — content was empty placeholder]_",
  );
  // taskList HTML noise from Joplin lists
  body = body.replace(/<ul data-type="taskList">[\s\S]*?<\/ul>/g, "");
  body = body.replace(/<li data-checked="(true|false)"[\s\S]*?<\/li>/g, "");
  // data-id="..." attributes on otherwise-fine tags
  body = body.replace(/\s+data-id="[^"]*"/g, "");
  body = body.replace(/\s+data-type="[^"]*"/g, "");
  body = body.replace(/\s+data-checked="[^"]*"/g, "");
  // Empty <p></p>
  body = body.replace(/<p>\s*<\/p>/g, "");
  // Collapse runs of 3+ blank lines
  body = body.replace(/\n{3,}/g, "\n\n");
  return body.trim();
}

type PageRow = {
  sourcePath: string;
  topFolder: string;
  /** Relative path inside Clients/<topFolder>/ */
  innerPath: string | null;
  title: string;
  kind: "overview" | "location" | "guide" | "note";
  bodyMd: string;
};

function walkClients(rootDir: string): PageRow[] {
  const clientsDir = path.join(rootDir, "Clients");
  if (!fs.existsSync(clientsDir)) {
    throw new Error(`Expected directory not found: ${clientsDir}`);
  }
  const pages: PageRow[] = [];

  // Top-level files: Clients/<Client>.md
  for (const f of fs.readdirSync(clientsDir)) {
    if (!f.endsWith(".md")) continue;
    if (f === "Template.md") continue;
    const fullPath = path.join(clientsDir, f);
    if (!fs.statSync(fullPath).isFile()) continue;
    const clientName = f.replace(/\.md$/, "");
    const raw = fs.readFileSync(fullPath, "utf8");
    pages.push({
      sourcePath: `Clients/${f}`,
      topFolder: clientName,
      innerPath: null,
      title: clientName,
      kind: "overview",
      bodyMd: cleanBody(raw),
    });
  }

  // Nested files: Clients/<Client>/...
  for (const top of fs.readdirSync(clientsDir)) {
    const topDir = path.join(clientsDir, top);
    if (!fs.statSync(topDir).isDirectory()) continue;
    if (top === "Template") continue;
    walkRecursive(topDir, top, "", pages);
  }
  return pages;
}

function walkRecursive(
  dir: string,
  topFolder: string,
  rel: string,
  out: PageRow[],
): void {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    const innerRel = rel ? `${rel}/${entry}` : entry;
    if (stat.isDirectory()) {
      // Skip Joplin's resource folders (containing images / attachments).
      if (entry === "_files" || entry.startsWith("_") || entry === "files")
        continue;
      walkRecursive(full, topFolder, innerRel, out);
      continue;
    }
    if (!entry.endsWith(".md")) continue;
    const title = entry.replace(/\.md$/, "");
    let kind: PageRow["kind"] = "note";
    const lowerRel = innerRel.toLowerCase();
    if (lowerRel.startsWith("locations/")) kind = "location";
    else if (lowerRel.startsWith("guides/")) kind = "guide";
    const raw = fs.readFileSync(full, "utf8");
    out.push({
      sourcePath: `Clients/${topFolder}/${innerRel}`,
      topFolder,
      innerPath: innerRel,
      title,
      kind,
      bodyMd: cleanBody(raw),
    });
  }
}

async function main() {
  const rootDir = process.argv[2] ?? "/tmp/techos-export";
  if (!fs.existsSync(rootDir)) {
    console.error(`Extracted ZIP not found at ${rootDir}.`);
    console.error(
      `Run:  unzip -o "<path-to-zip>" -d /tmp/techos-export  then re-run this script.`,
    );
    process.exit(1);
  }

  const pages = walkClients(rootDir);
  console.log(`Found ${pages.length} markdown pages under Clients/.`);

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const orgRow = await c.query<{ id: string }>(
    `SELECT id FROM organizations WHERE name = $1 LIMIT 1`,
    [ORG_NAME],
  );
  if (orgRow.rows.length === 0) throw new Error(`Org "${ORG_NAME}" not found`);
  const orgId = orgRow.rows[0].id;

  // Pre-load clients + locations for matching.
  const clientRows = await c.query<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE organization_id = $1`,
    [orgId],
  );
  const clientByNorm = new Map<string, string>();
  for (const r of clientRows.rows) clientByNorm.set(norm(r.name), r.id);

  const matchClient = (folder: string): string | null => {
    const key = norm(folder);
    if (clientByNorm.has(key)) return clientByNorm.get(key)!;
    const alias = CLIENT_ALIASES[key];
    if (alias && clientByNorm.has(norm(alias))) {
      return clientByNorm.get(norm(alias))!;
    }
    return null;
  };

  const locationRows = await c.query<{
    id: string;
    client_id: string;
    label: string;
  }>(`SELECT id, client_id, label FROM client_locations`);
  // Map { client_id → Map { normalized label → location_id } }
  const locationByClient = new Map<string, Map<string, string>>();
  for (const l of locationRows.rows) {
    const map = locationByClient.get(l.client_id) ?? new Map<string, string>();
    map.set(norm(l.label), l.id);
    locationByClient.set(l.client_id, map);
  }

  // First pass: insert / refresh pages.
  type Inserted = {
    id: string;
    clientId: string;
    sourcePath: string;
    innerPath: string | null;
    kind: PageRow["kind"];
  };
  const inserted: Inserted[] = [];
  let skipped = 0;
  const unmatched: string[] = [];
  let created = 0;
  let updated = 0;

  for (const p of pages) {
    const cid = matchClient(p.topFolder);
    if (!cid) {
      skipped++;
      unmatched.push(p.topFolder);
      continue;
    }
    // Resolve location for kind='location'.
    let locationId: string | null = null;
    if (p.kind === "location") {
      const locMap = locationByClient.get(cid);
      if (locMap) {
        locationId = locMap.get(norm(p.title)) ?? null;
      }
    }
    const slug = slugify(p.innerPath ?? p.title);
    const sortOrder =
      p.kind === "overview" ? 0 : p.kind === "location" ? 100 : p.kind === "guide" ? 200 : 300;

    // UPSERT on (client_id, source_path).
    const result = await c.query<{ id: string; xmax: string }>(
      `INSERT INTO client_pages
         (organization_id, client_id, location_id, title, slug, kind,
          body_md, source, source_path, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'import:joplin', $8, $9, NOW(), NOW())
       ON CONFLICT (client_id, source_path)
       DO UPDATE SET
         title = EXCLUDED.title,
         kind = EXCLUDED.kind,
         body_md = EXCLUDED.body_md,
         location_id = EXCLUDED.location_id,
         updated_at = NOW()
       RETURNING id, (xmax::text)::text AS xmax`,
      [
        orgId,
        cid,
        locationId,
        p.title,
        slug,
        p.kind,
        p.bodyMd,
        p.sourcePath,
        sortOrder,
      ],
    );
    // xmax = 0 means INSERT, non-zero means UPDATE.
    if (result.rows[0].xmax === "0") created++;
    else updated++;
    inserted.push({
      id: result.rows[0].id,
      clientId: cid,
      sourcePath: p.sourcePath,
      innerPath: p.innerPath,
      kind: p.kind,
    });
  }

  console.log(
    `\nFirst pass: ${created} created, ${updated} updated, ${skipped} skipped (no client match).`,
  );

  // Second pass: resolve parent_page_id.
  // Each non-overview page's parent is its client's overview page.
  // (We could go deeper but Joplin's tree is shallow — overview →
  // location/guide is the only level used.)
  const overviewByClient = new Map<string, string>();
  for (const i of inserted) {
    if (i.kind === "overview") overviewByClient.set(i.clientId, i.id);
  }
  let parentsSet = 0;
  for (const i of inserted) {
    if (i.kind === "overview") continue;
    const overviewId = overviewByClient.get(i.clientId);
    if (!overviewId) continue;
    await c.query(
      `UPDATE client_pages SET parent_page_id = $1 WHERE id = $2`,
      [overviewId, i.id],
    );
    parentsSet++;
  }
  console.log(`Linked ${parentsSet} pages to their client overview parent.`);

  // Summary by client.
  const byClient = new Map<string, number>();
  for (const i of inserted) {
    byClient.set(i.clientId, (byClient.get(i.clientId) ?? 0) + 1);
  }
  console.log(`\nPages per client:`);
  for (const r of clientRows.rows) {
    const n = byClient.get(r.id) ?? 0;
    if (n > 0) console.log(`  ${String(n).padStart(3)}  ${r.name}`);
  }

  if (unmatched.length > 0) {
    const u = new Set(unmatched);
    console.log(`\nUnmatched top-level folders (skipped):`);
    for (const x of u) console.log(`  ${x}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
