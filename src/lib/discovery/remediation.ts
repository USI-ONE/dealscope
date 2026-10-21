/**
 * Remediation plan for a walk.
 *
 * Tasks come from three places, each with a stable `sourceRef` so building
 * the plan again only adds what's new:
 *   finding:<area.key>  — a scorecard finding (closing it re-grades the site)
 *   item:<recordId>     — inventory flagged Replace / Decommission / Needs-eval
 *   drop:<field>        — planned cable drops
 * Crews can also add their own (source "manual").
 */
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveryTasks, type DiscoveryTask } from "@/db/schema";
import { AREAS, type SiteAssessment } from "./assessment";
import type { ProjectData } from "./load";
import { sectionFields } from "./templates";

export const TASK_STATUSES = ["open", "in_progress", "done", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["Blocker", "High", "Medium", "Low"] as const;

type PlannedTask = Pick<DiscoveryTask, "source" | "sourceRef" | "area" | "title" | "detail" | "priority" | "sortOrder">;

const ITEM_AREA: Record<string, string> = {
  aps: "wifi",
  access_switches: "network",
  cameras: "security",
  doors: "security",
  printers: "network",
  rooms: "network",
  servers: "network",
  workstations: "network",
  idfs: "closet",
};

/** What the walk says should be done, in priority order. */
export function plannedTasks(a: SiteAssessment, data: ProjectData): PlannedTask[] {
  const out: PlannedTask[] = [];
  let order = 0;
  for (const area of a.areas) {
    for (const f of area.findings) {
      out.push({
        source: "finding",
        sourceRef: `finding:${f.id}`,
        area: area.key,
        title: f.action,
        detail: f.text,
        priority: f.points >= 30 ? "High" : f.points >= 15 ? "Medium" : "Low",
        sortOrder: order++,
      });
    }
  }
  for (const r of data.recordRows) {
    if (!(r.tableKey in ITEM_AREA) || !r.data.keep || r.data.keep === "Keep") continue;
    const item = a.workItems.find((w) => w.id === r.id);
    if (!item) continue;
    out.push({
      source: "item",
      sourceRef: `item:${r.id}`,
      area: ITEM_AREA[r.tableKey],
      title: `${item.action === "Needs-eval" ? "Evaluate" : item.action}: ${item.kind.toLowerCase()} — ${item.title}`,
      detail: item.notes || null,
      priority: item.action === "Replace" ? "Medium" : "Low",
      sortOrder: order++,
    });
  }
  const cabling = data.template.sections.find((s) => s.key === "cabling");
  for (const f of cabling ? sectionFields(cabling) : []) {
    if (!f.key.startsWith("drop_")) continue;
    const a2 = data.answers.get(f.questionKey);
    const n = Number(a2?.value?.v) || 0;
    if (n <= 0) continue;
    out.push({
      source: "drop",
      sourceRef: `drop:${f.key}`,
      area: "network",
      title: `Pull ${n} new ${f.label.replace(/\s*\(.*?\)\s*/g, " ").trim().toLowerCase()} drop${n === 1 ? "" : "s"}`,
      detail: a2?.notes || null,
      priority: "Medium",
      sortOrder: order++,
    });
  }
  return out;
}

export async function loadTasks(projectId: string) {
  return db
    .select()
    .from(discoveryTasks)
    .where(eq(discoveryTasks.projectId, projectId))
    .orderBy(asc(discoveryTasks.sortOrder), asc(discoveryTasks.createdAt));
}

/** Finding ids closed out by completed tasks — these stop costing points. */
export function resolvedFindings(tasks: DiscoveryTask[]) {
  return new Set(
    tasks.filter((t) => t.status === "done" && t.sourceRef?.startsWith("finding:")).map((t) => t.sourceRef!.slice(8)),
  );
}

/** Add any planned task that isn't on the list yet. Returns how many were added. */
export async function syncTasks(opts: {
  organizationId: string;
  projectId: string;
  membershipId: string;
  planned: PlannedTask[];
}) {
  const existing = await db
    .select({ sourceRef: discoveryTasks.sourceRef })
    .from(discoveryTasks)
    .where(and(eq(discoveryTasks.projectId, opts.projectId)));
  const have = new Set(existing.map((e) => e.sourceRef));
  const add = opts.planned.filter((p) => p.sourceRef && !have.has(p.sourceRef));
  if (add.length)
    await db.insert(discoveryTasks).values(
      add.map((p) => ({
        ...p,
        organizationId: opts.organizationId,
        projectId: opts.projectId,
        createdByMembershipId: opts.membershipId,
      })),
    );
  return add.length;
}

export const AREA_TITLE: Record<string, string> = Object.fromEntries(AREAS.map((a) => [a.key, a.title]));
