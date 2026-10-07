import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { clients, discoveryTopologies, DISCOVERY_STATUS_LABEL } from "@/db/schema";
import { TopologySvg } from "@/components/discovery/topology-svg";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { answerToText, sectionFields, templateIndex } from "@/lib/discovery/templates";
import { PrintButton } from "@/components/discovery/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site discovery report" };

export default async function DiscoveryReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const [{ template, answers, recordRows, photoRows, progress }, client, topologies] = await Promise.all([
    loadProjectData(project),
    project.clientId ? db.query.clients.findFirst({ where: eq(clients.id, project.clientId), columns: { name: true } }) : null,
    db.select().from(discoveryTopologies).where(eq(discoveryTopologies.projectId, project.id)).orderBy(asc(discoveryTopologies.createdAt)),
  ]);
  const idx = templateIndex(template);

  const photosByQuestion = new Map<string, typeof photoRows>();
  const photosByRecord = new Map<string, typeof photoRows>();
  for (const p of photoRows) {
    if (p.questionKey) photosByQuestion.set(p.questionKey, [...(photosByQuestion.get(p.questionKey) ?? []), p]);
    if (p.recordId) photosByRecord.set(p.recordId, [...(photosByRecord.get(p.recordId) ?? []), p]);
  }

  const risks = recordRows
    .filter((r) => r.tableKey === "risks")
    .sort((a, b) => ["Blocker", "High", "Medium", "Low"].indexOf(a.data.level ?? "") - ["Blocker", "High", "Medium", "Low"].indexOf(b.data.level ?? ""));

  const Thumbs = ({ list }: { list: typeof photoRows | undefined }) =>
    list?.length ? (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {list.map((p) => (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? ""} className="h-24 w-32 rounded border border-border object-cover print:h-28 print:w-36" />
            {p.caption && <span className="block max-w-32 truncate text-[10px] text-muted-foreground">{p.caption}</span>}
          </a>
        ))}
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16 print:max-w-none print:space-y-6 print:text-[11px]">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/discovery/${project.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" /> {project.name}
        </Link>
        <PrintButton />
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{template.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[client?.name, project.siteAddress, project.scheduledDate && `Walked ${project.scheduledDate}`, DISCOVERY_STATUS_LABEL[project.status]]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-sm">
          {progress.pct}% captured · {progress.requiredPhotosDone}/{progress.requiredPhotos} required photos · {photoRows.length} photos ·{" "}
          {recordRows.length} inventory records
        </p>
        {project.summary && <p className="whitespace-pre-wrap pt-2 text-[15px] leading-relaxed">{project.summary}</p>}
      </header>

      {risks.length > 0 && (
        <section className="break-inside-avoid space-y-2">
          <h2 className="text-xl font-semibold">Risks & blockers</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-1.5 pr-2">Level</th>
                <th className="py-1.5 pr-2">Risk</th>
                <th className="py-1.5 pr-2">Owner</th>
                <th className="py-1.5">Needed by</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-1.5 pr-2 font-semibold">{r.data.level || "—"}</td>
                  <td className="py-1.5 pr-2">
                    {r.data.risk}
                    {r.data.area && <span className="text-muted-foreground"> · {r.data.area}</span>}
                  </td>
                  <td className="py-1.5 pr-2">{r.data.owner}</td>
                  <td className="py-1.5">{r.data.needed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {topologies
        .filter((t) => t.graph)
        .map((t) => (
          <section key={t.id} className="space-y-2 break-inside-avoid">
            <h2 className="text-xl font-semibold">Network topology — {t.title}</h2>
            {t.graph!.summary && <p className="text-sm">{t.graph!.summary}</p>}
            <div className="overflow-x-auto rounded border border-border print:overflow-visible">
              <TopologySvg graph={t.graph!} />
            </div>
            {t.graph!.uncertainties.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {t.graph!.uncertainties.map((u, i) => (
                  <li key={i}>Verify: {u}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

      {template.sections.map((section) => {
        if (section.key === "risks") return null;
        const na = project.naSections.includes(section.key);
        const fields = sectionFields(section).filter((f) => {
          const a = answers.get(f.questionKey);
          return answerToText(f, a) || a?.notes || photosByQuestion.get(f.questionKey)?.length;
        });
        const tables = section.blocks.flatMap((b) => (b.kind === "table" ? [b.table] : []));
        const hasRecords = tables.some((t) => recordRows.some((r) => r.tableKey === t.key));
        if (!na && !fields.length && !hasRecords) return null;
        return (
          <section key={section.key} className="space-y-3">
            <h2 className="border-b border-border pb-1 text-xl font-semibold">
              {section.number}. {section.title}
              {na && <span className="ml-2 text-sm font-normal text-muted-foreground">— N/A at this site</span>}
            </h2>
            {!na &&
              tables.map((t) => {
                const rows = recordRows.filter((r) => r.tableKey === t.key);
                if (!rows.length) return null;
                const cols = t.columns.filter((c) => rows.some((r) => r.data[c.key]));
                return (
                  <div key={t.key} className="space-y-1">
                    <h3 className="text-[15px] font-semibold">
                      {t.title} ({rows.length})
                    </h3>
                    <div className="overflow-x-auto print:overflow-visible">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-border text-left uppercase text-muted-foreground">
                            {cols.map((c) => (
                              <th key={c.key} className="py-1 pr-2 font-medium">
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id} className="break-inside-avoid border-b border-border/60 align-top">
                              {cols.map((c) => (
                                <td key={c.key} className="py-1 pr-2">
                                  {r.data[c.key]}
                                  {c.unit && r.data[c.key] ? ` ${c.unit}` : ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {rows.some((r) => photosByRecord.get(r.id)?.length) && (
                      <div className="space-y-2 pt-1">
                        {rows
                          .filter((r) => photosByRecord.get(r.id)?.length)
                          .map((r) => (
                            <div key={r.id} className="break-inside-avoid">
                              <p className="text-xs font-medium">{t.titleKeys.map((k) => r.data[k]).filter(Boolean).join(" · ")}</p>
                              <Thumbs list={photosByRecord.get(r.id)} />
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            {!na && fields.length > 0 && (
              <dl className="divide-y divide-border/60">
                {fields.map((f) => {
                  const a = answers.get(f.questionKey);
                  const v = a?.value?.v;
                  const sig = f.type === "signature" && v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : null;
                  return (
                    <div key={f.questionKey} className="break-inside-avoid gap-4 py-1.5 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                      <dt className="text-sm text-muted-foreground">{f.label}</dt>
                      <dd className="text-sm">
                        {sig?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sig.image} alt="Signature" className="h-16 rounded border border-border bg-white" />
                        ) : null}
                        {answerToText(f, a)}
                        {a?.notes && <p className="text-muted-foreground">{a.notes}</p>}
                        <Thumbs list={photosByQuestion.get(f.questionKey)} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </section>
        );
      })}

      {idx.sections.size > 0 && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Generated {new Date().toLocaleString("en-US")} · DealScope site discovery
        </p>
      )}
    </div>
  );
}
