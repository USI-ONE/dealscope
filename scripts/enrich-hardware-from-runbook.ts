/**
 * One-shot: scan every active runbook page (`client_pages.body_md`) for
 * mentions of each device label in `hardware.label`, then enrich the
 * matching hardware row with:
 *
 *   1. A "Runbook mentions: …" line appended to `notes` so techs can see
 *      at a glance which runbook pages talk about the device.
 *   2. `location_id` backfill when the device currently has no location
 *      and a matching page is itself a location page.
 *
 * Idempotent: it removes any existing "Runbook mentions:" block from the
 * notes column before re-writing, so this script can be re-run safely as
 * runbook content grows.
 *
 * Match policy:
 *   • Label length ≥ 4 (avoid noise from "01", "CL")
 *   • Word-boundary regex, case-insensitive
 *   • Skip purely-numeric labels
 *
 * Run:
 *   pnpm exec tsx scripts/enrich-hardware-from-runbook.ts
 *   pnpm exec tsx scripts/enrich-hardware-from-runbook.ts --dry-run
 */
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
// Resolve env files against this script's directory so the script runs
// correctly regardless of cwd (e.g. from a sibling worktree).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const envLocal = path.join(REPO, ".env.local");
const envDefault = path.join(REPO, ".env");
loadEnv({ path: envLocal });
loadEnv({ path: envDefault });
if (!process.env.DATABASE_URL) {
  console.error(
    `DATABASE_URL not set after loading env. Tried:\n  ${envLocal}\n  ${envDefault}`,
  );
  process.exit(1);
}

import { Client } from "pg";

const ORG_NAME = "Universal Systems Inc";
const DRY_RUN = process.argv.includes("--dry-run");

// Marker lines in notes — used so re-runs cleanly replace the prior block
// instead of stacking new lines on top of stale data.
const NOTES_BEGIN = "<!-- runbook-mentions:begin -->";
const NOTES_END = "<!-- runbook-mentions:end -->";

type HardwareRow = {
  id: string;
  client_id: string;
  label: string;
  location_id: string | null;
  notes: string | null;
};

type PageRow = {
  id: string;
  client_id: string;
  title: string;
  location_id: string | null;
  body_md: string | null;
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Should we even try to match this label?
 *   • ≥ 4 chars
 *   • not purely digits
 *   • not purely a kind word like "server" / "laptop"
 */
function isUsefulLabel(label: string): boolean {
  if (label.length < 4) return false;
  if (/^[\d-]+$/.test(label)) return false;
  if (/^(server|laptop|router|switch|firewall|printer|workstation)s?$/i.test(label)) {
    return false;
  }
  return true;
}

/**
 * Strip the prior runbook-mentions block (between markers) from notes so
 * we can rewrite cleanly.
 */
function stripPriorBlock(notes: string | null): string {
  if (!notes) return "";
  const re = new RegExp(
    `\\n*${escapeRegex(NOTES_BEGIN)}[\\s\\S]*?${escapeRegex(NOTES_END)}\\n*`,
    "g",
  );
  return notes.replace(re, "").trimEnd();
}

function buildBlock(pageTitles: string[]): string {
  // Keep it short — just the titles, deduped & sorted.
  const unique = Array.from(new Set(pageTitles)).sort();
  return `${NOTES_BEGIN}\nRunbook mentions: ${unique.join(", ")}\n${NOTES_END}`;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const orgRes = await db.query<{ id: string }>(
    `select id from organizations where name = $1 limit 1`,
    [ORG_NAME],
  );
  if (orgRes.rows.length === 0) {
    throw new Error(`Organization "${ORG_NAME}" not found`);
  }
  const orgId = orgRes.rows[0].id;

  // Load everything in two queries (one per table). Per-client filtering
  // happens in JS so we only walk each page body once per matching
  // device.
  const hwRes = await db.query<HardwareRow>(
    `select id, client_id, label, location_id, notes
       from hardware
      where organization_id = $1`,
    [orgId],
  );
  const pageRes = await db.query<PageRow>(
    `select id, client_id, title, location_id, body_md
       from client_pages
      where organization_id = $1 and archived_at is null`,
    [orgId],
  );

  // Group pages by client to avoid an O(devices * pages) full scan.
  const pagesByClient = new Map<string, PageRow[]>();
  for (const p of pageRes.rows) {
    if (!p.body_md) continue;
    const arr = pagesByClient.get(p.client_id) ?? [];
    arr.push(p);
    pagesByClient.set(p.client_id, arr);
  }

  let updatedNotes = 0;
  let updatedLocation = 0;
  let scanned = 0;

  for (const hw of hwRes.rows) {
    scanned++;
    if (!isUsefulLabel(hw.label)) continue;
    const pages = pagesByClient.get(hw.client_id) ?? [];
    if (pages.length === 0) continue;

    // Word-boundary, case-insensitive search for the label in each
    // page body. Word boundary handles "CL-0247" cleanly because the `-`
    // and digits sit between word chars.
    const re = new RegExp(`\\b${escapeRegex(hw.label)}\\b`, "i");
    const matches: PageRow[] = [];
    for (const p of pages) {
      if (re.test(p.body_md!)) {
        matches.push(p);
      }
    }
    if (matches.length === 0) continue;

    const titles = matches.map((m) => m.title);
    const newBlock = buildBlock(titles);
    const cleaned = stripPriorBlock(hw.notes);
    const nextNotes = cleaned ? `${cleaned}\n\n${newBlock}` : newBlock;

    // Only the new block changes — that means re-runs are no-ops unless
    // the runbook content actually changed.
    if (nextNotes !== (hw.notes ?? "")) {
      if (!DRY_RUN) {
        await db.query(
          `update hardware set notes = $1, updated_at = now() where id = $2`,
          [nextNotes, hw.id],
        );
      }
      updatedNotes++;
      console.log(
        `  ${hw.label.padEnd(20)} → mentioned in: ${titles.slice(0, 4).join(", ")}${titles.length > 4 ? ` (+${titles.length - 4} more)` : ""}`,
      );
    }

    // Location backfill — only if currently null and at least one
    // matching page is itself a location page with a location_id.
    if (!hw.location_id) {
      const locMatch = matches.find((m) => m.location_id);
      if (locMatch?.location_id) {
        if (!DRY_RUN) {
          await db.query(
            `update hardware set location_id = $1, updated_at = now() where id = $2`,
            [locMatch.location_id, hw.id],
          );
        }
        updatedLocation++;
        console.log(
          `  → ${hw.label}: location set from page "${locMatch.title}"`,
        );
      }
    }
  }

  console.log("");
  console.log(`Scanned ${scanned} hardware rows.`);
  console.log(
    `${DRY_RUN ? "[dry-run] would update" : "Updated"} notes on ${updatedNotes} devices.`,
  );
  console.log(
    `${DRY_RUN ? "[dry-run] would backfill" : "Backfilled"} location on ${updatedLocation} devices.`,
  );

  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
