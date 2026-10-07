import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { photoMode, recordTitle, sectionFields, templateIndex } from "@/lib/discovery/templates";
import { photoUrl } from "@/lib/discovery/paths";
import { PhotoHub, type GalleryPhoto, type ShotGroup } from "@/components/discovery/photo-hub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site walk photos" };

export default async function DiscoveryPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const { template, photoRows, recordRows } = await loadProjectData(project);
  const idx = templateIndex(template);
  const recordById = new Map(recordRows.map((r) => [r.id, r]));

  const photos: GalleryPhoto[] = photoRows.map((p) => {
    let label = "General";
    let sectionKey = p.sectionKey ?? "general";
    if (p.questionKey) {
      const f = idx.fields.get(p.questionKey);
      label = f?.label ?? p.questionKey;
      sectionKey = f?.sectionKey ?? sectionKey;
    } else if (p.recordId) {
      const r = recordById.get(p.recordId);
      const t = r ? idx.tables.get(r.tableKey) : undefined;
      if (r && t) {
        label = `${t.table.singular}: ${recordTitle(t.table, r.data)}`;
        sectionKey = t.sectionKey;
      }
    }
    return {
      id: p.id,
      url: photoUrl(project.id, p.id),
      caption: p.caption,
      takenAt: p.takenAt?.toISOString() ?? null,
      questionKey: p.questionKey,
      recordId: p.recordId,
      sectionKey,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      label,
    };
  });

  const shotGroups: ShotGroup[] = template.sections
    .map((s) => ({
      sectionKey: s.key,
      title: s.title,
      na: project.naSections.includes(s.key),
      shots: sectionFields(s)
        .filter((f) => photoMode(f) === "required")
        .map((f) => ({ questionKey: f.questionKey, label: f.label, hint: f.hint ?? null })),
    }))
    .filter((g) => g.shots.length > 0);

  const sectionTitles = Object.fromEntries([
    ["general", "General"],
    ["topology", "Network topology sources"],
    ...template.sections.map((s) => [s.key, s.title]),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <Link href={`/discovery/${project.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> {project.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Photos</h1>
      <PhotoHub photos={photos} shotGroups={shotGroups} sectionTitles={sectionTitles} />
    </div>
  );
}
