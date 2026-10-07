import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Network } from "lucide-react";
import { db } from "@/db";
import { discoveryTopologies } from "@/db/schema";
import { canCtx, requireRole } from "@/lib/auth-helpers";
import { getProject } from "@/lib/discovery/load";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { TOPOLOGY_SOURCE_KINDS, type TopologySourceKind } from "@/lib/discovery/topology-ai";
import { TopologyCapture } from "@/components/discovery/topology-capture";

export const dynamic = "force-dynamic";
// Vision extraction runs inside the server action this page invokes.
export const maxDuration = 300;
export const metadata = { title: "Network topology" };

export default async function TopologyListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const topologies = await db
    .select()
    .from(discoveryTopologies)
    .where(eq(discoveryTopologies.projectId, project.id))
    .orderBy(desc(discoveryTopologies.createdAt));
  const canEdit = canCtx("update", "project", ctx);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <Link href={`/discovery/${project.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> {project.name}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Network topology</h1>
        <p className="text-sm text-muted-foreground">
          Turn a controller screenshot, whiteboard, napkin sketch or marked-up floor plan into editable topology documentation.
        </p>
      </div>

      {canEdit &&
        (isAiConfigured() ? (
          <TopologyCapture />
        ) : (
          <p className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            AI isn&apos;t configured — set <code>ANTHROPIC_API_KEY</code> in the Vercel project to enable topology extraction.
          </p>
        ))}

      {topologies.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {topologies.map((t) => (
            <li key={t.id}>
              <Link href={`/discovery/${project.id}/topology/${t.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-accent">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  {t.status === "extracting" ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : t.status === "error" ? (
                    <AlertTriangle className="size-5 text-amber-500" />
                  ) : (
                    <Network className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{t.title}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {TOPOLOGY_SOURCE_KINDS[t.sourceKind as TopologySourceKind] ?? t.sourceKind}
                    {t.graph ? ` · ${t.graph.nodes.length} devices · ${t.graph.links.length} links` : ""}
                    {t.graph?.uncertainties.length ? ` · ${t.graph.uncertainties.length} to verify` : ""}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
