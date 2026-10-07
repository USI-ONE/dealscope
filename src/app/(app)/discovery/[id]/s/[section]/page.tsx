import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth-helpers";
import { computeSuggestions, getProject, loadProjectData } from "@/lib/discovery/load";
import { sectionTables, type AnswerState } from "@/lib/discovery/templates";
import { photoUrl } from "@/lib/discovery/paths";
import { SectionView } from "@/components/discovery/section-view";
import type { RecordRow } from "@/components/discovery/record-list";
import type { ServerPhoto } from "@/components/discovery/project-context";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Site walk" };
}

export default async function DiscoverySectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; section: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id, section: sectionKey } = await params;
  const { q } = await searchParams;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();

  const { template, answerRows, recordRows, photoRows } = await loadProjectData(project);
  const idx = template.sections.findIndex((s) => s.key === sectionKey);
  if (idx < 0) notFound();
  const section = template.sections[idx];

  const prefix = `${section.key}.`;
  const answers: Record<string, AnswerState> = {};
  for (const a of answerRows) {
    if (a.questionKey.startsWith(prefix))
      answers[a.questionKey] = { value: a.value, notApplicable: a.notApplicable, notes: a.notes };
  }

  const tableKeys = new Set(sectionTables(section).map((t) => t.key));
  const records: Record<string, RecordRow[]> = {};
  for (const t of tableKeys) records[t] = [];
  const sectionRecordIds = new Set<string>();
  for (const r of recordRows) {
    if (!tableKeys.has(r.tableKey)) continue;
    records[r.tableKey].push({ id: r.id, data: r.data, sortOrder: r.sortOrder });
    sectionRecordIds.add(r.id);
  }

  const photos: ServerPhoto[] = photoRows
    .filter((p) => (p.questionKey?.startsWith(prefix) ?? false) || (p.recordId && sectionRecordIds.has(p.recordId)))
    .map((p) => ({
      id: p.id,
      url: photoUrl(project.id, p.id),
      caption: p.caption,
      takenAt: p.takenAt?.toISOString() ?? null,
      questionKey: p.questionKey,
      recordId: p.recordId,
      sectionKey: p.sectionKey,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
    }));

  const allSuggestions = section.key === "rollup" ? computeSuggestions(template, recordRows) : {};
  const prev = template.sections[idx - 1];
  const next = template.sections[idx + 1];

  return (
    <SectionView
      key={section.key}
      templateKey={template.key}
      sectionKey={section.key}
      answers={answers}
      records={records}
      photos={photos}
      suggestions={allSuggestions}
      sectionNa={project.naSections.includes(section.key)}
      prev={prev ? { key: prev.key, title: prev.short } : null}
      next={next ? { key: next.key, title: next.short } : null}
      focus={q}
    />
  );
}
