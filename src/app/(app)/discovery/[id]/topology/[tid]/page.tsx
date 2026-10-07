import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { discoveryPhotos, discoveryTopologies } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { TopologyEditor } from "@/components/discovery/topology-editor";
import { photoUrl } from "@/lib/discovery/paths";

export const dynamic = "force-dynamic";
// Refine / retry run vision extraction inside server actions from this page.
export const maxDuration = 300;
export const metadata = { title: "Network topology" };

export default async function TopologyDetailPage({ params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params;
  const ctx = await requireRole("member");
  if (!/^[0-9a-f-]{36}$/i.test(tid)) notFound();
  const topo = await db.query.discoveryTopologies.findFirst({
    where: and(
      eq(discoveryTopologies.id, tid),
      eq(discoveryTopologies.projectId, id),
      eq(discoveryTopologies.organizationId, ctx.organization.id),
    ),
  });
  if (!topo) notFound();

  const sources = topo.sourcePhotoIds.length
    ? await db
        .select({ id: discoveryPhotos.id, url: discoveryPhotos.url })
        .from(discoveryPhotos)
        .where(and(eq(discoveryPhotos.projectId, id), inArray(discoveryPhotos.id, topo.sourcePhotoIds)))
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/discovery/${id}/topology`} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> Network topology
      </Link>
      <TopologyEditor
        key={topo.updatedAt.toISOString()}
        topologyId={topo.id}
        title={topo.title}
        status={topo.status}
        error={topo.error}
        graph={topo.graph}
        sources={sources.map((s) => ({ id: s.id, url: photoUrl(id, s.id) }))}
      />
    </div>
  );
}
