import { notFound } from "next/navigation";
import { canCtx, requireRole } from "@/lib/auth-helpers";
import { getProject } from "@/lib/discovery/load";
import { photoPathPrefix } from "@/lib/discovery/paths";
import { DiscoveryProjectProvider } from "@/components/discovery/project-context";

export default async function DiscoveryProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole("member");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();

  return (
    <DiscoveryProjectProvider
      value={{
        projectId: project.id,
        projectName: project.name,
        pathPrefix: photoPathPrefix(ctx.organization.id, project.id),
        canEdit: canCtx("update", "project", ctx) && !project.archivedAt,
      }}
    >
      {children}
    </DiscoveryProjectProvider>
  );
}
