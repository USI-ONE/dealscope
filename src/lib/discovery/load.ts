import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  discoveryAnswers,
  discoveryPhotos,
  discoveryProjects,
  discoveryRecords,
  type DiscoveryProject,
} from "@/db/schema";
import {
  getTemplate,
  sectionProgress,
  type AnswerState,
  type SectionProgress,
} from "./templates";
import type { TemplateDef } from "./types";

export async function getProject(id: string, organizationId: string) {
  return db.query.discoveryProjects.findFirst({
    where: and(eq(discoveryProjects.id, id), eq(discoveryProjects.organizationId, organizationId)),
  });
}

export type ProjectData = Awaited<ReturnType<typeof loadProjectData>>;

export async function loadProjectData(project: DiscoveryProject) {
  const [answerRows, recordRows, photoRows] = await Promise.all([
    db.select().from(discoveryAnswers).where(eq(discoveryAnswers.projectId, project.id)),
    db
      .select()
      .from(discoveryRecords)
      .where(eq(discoveryRecords.projectId, project.id))
      .orderBy(asc(discoveryRecords.sortOrder), asc(discoveryRecords.createdAt)),
    db
      .select()
      .from(discoveryPhotos)
      .where(eq(discoveryPhotos.projectId, project.id))
      .orderBy(asc(discoveryPhotos.takenAt), asc(discoveryPhotos.createdAt)),
  ]);

  const answers = new Map<string, AnswerState>(
    answerRows.map((a) => [a.questionKey, { value: a.value, notApplicable: a.notApplicable, notes: a.notes }]),
  );
  const recordCounts = new Map<string, number>();
  for (const r of recordRows) recordCounts.set(r.tableKey, (recordCounts.get(r.tableKey) ?? 0) + 1);
  const photoCounts = new Map<string, number>();
  for (const p of photoRows) {
    if (p.questionKey) photoCounts.set(p.questionKey, (photoCounts.get(p.questionKey) ?? 0) + 1);
  }

  const template = getTemplate(project.templateKey);
  const progress = computeProgress(template, {
    answers,
    recordCounts,
    photoCounts,
    naSections: project.naSections,
  });

  return { template, answers, answerRows, recordRows, photoRows, recordCounts, photoCounts, progress };
}

export type ProjectProgress = {
  sections: Map<string, SectionProgress>;
  done: number;
  total: number;
  requiredPhotos: number;
  requiredPhotosDone: number;
  pct: number;
};

export function computeProgress(
  template: TemplateDef,
  input: Parameters<typeof sectionProgress>[1],
): ProjectProgress {
  const sections = new Map<string, SectionProgress>();
  let done = 0;
  let total = 0;
  let requiredPhotos = 0;
  let requiredPhotosDone = 0;
  for (const s of template.sections) {
    const p = sectionProgress(s, input);
    sections.set(s.key, p);
    done += p.done;
    total += p.total;
    requiredPhotos += p.requiredPhotos;
    requiredPhotosDone += p.requiredPhotosDone;
  }
  return { sections, done, total, requiredPhotos, requiredPhotosDone, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Lightweight progress for the project list. */
export async function listProjectsWithProgress(organizationId: string) {
  const projects = await db
    .select()
    .from(discoveryProjects)
    .where(and(eq(discoveryProjects.organizationId, organizationId), isNull(discoveryProjects.archivedAt)))
    .orderBy(asc(discoveryProjects.status), asc(discoveryProjects.scheduledDate));
  if (!projects.length) return [];
  const ids = projects.map((p) => p.id);
  const [answerRows, recordRows, photoRows] = await Promise.all([
    db
      .select({
        projectId: discoveryAnswers.projectId,
        questionKey: discoveryAnswers.questionKey,
        value: discoveryAnswers.value,
        notApplicable: discoveryAnswers.notApplicable,
      })
      .from(discoveryAnswers)
      .where(inArray(discoveryAnswers.projectId, ids)),
    db
      .select({ projectId: discoveryRecords.projectId, tableKey: discoveryRecords.tableKey })
      .from(discoveryRecords)
      .where(inArray(discoveryRecords.projectId, ids)),
    db
      .select({ projectId: discoveryPhotos.projectId, questionKey: discoveryPhotos.questionKey })
      .from(discoveryPhotos)
      .where(inArray(discoveryPhotos.projectId, ids)),
  ]);

  return projects.map((project) => {
    const answers = new Map<string, AnswerState>();
    for (const a of answerRows)
      if (a.projectId === project.id)
        answers.set(a.questionKey, { value: a.value, notApplicable: a.notApplicable, notes: null });
    const recordCounts = new Map<string, number>();
    let records = 0;
    for (const r of recordRows)
      if (r.projectId === project.id) {
        records++;
        recordCounts.set(r.tableKey, (recordCounts.get(r.tableKey) ?? 0) + 1);
      }
    const photoCounts = new Map<string, number>();
    let photos = 0;
    for (const p of photoRows)
      if (p.projectId === project.id) {
        photos++;
        if (p.questionKey) photoCounts.set(p.questionKey, (photoCounts.get(p.questionKey) ?? 0) + 1);
      }
    const progress = computeProgress(getTemplate(project.templateKey), {
      answers,
      recordCounts,
      photoCounts,
      naSections: project.naSections,
    });
    return { project, progress, records, photos };
  });
}

/** Counts that back the rollup "use suggestion" chips. */
export function computeSuggestions(
  template: TemplateDef,
  recordRows: Array<{ tableKey: string; data: Record<string, string> }>,
) {
  const out: Record<string, { count: number; label: string }> = {};
  for (const section of template.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "fields") continue;
      for (const f of block.fields) {
        if (!f.suggest) continue;
        const { tables, filterKeepReplace, label } = f.suggest;
        const count = recordRows.filter(
          (r) => tables.includes(r.tableKey) && (!filterKeepReplace || filterKeepReplace.includes(r.data.keep ?? "")),
        ).length;
        out[`${section.key}.${f.key}`] = { count, label };
      }
    }
  }
  return out;
}
