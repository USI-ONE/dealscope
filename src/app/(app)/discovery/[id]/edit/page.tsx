import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { canCtx, requirePermission } from "@/lib/auth-helpers";
import { getProject } from "@/lib/discovery/load";
import { loadProjectFormOptions } from "@/lib/discovery/form-options";
import { ProjectForm } from "@/components/discovery/project-form";
import { ArchiveButton } from "@/components/discovery/archive-button";
import { DeleteWalkButton } from "@/components/discovery/delete-walk-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit site walk" };

export default async function EditDiscoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("update", "project");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const options = await loadProjectFormOptions(ctx.organization.id);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href={`/discovery/${project.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> {project.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Walk details</h1>
      <ProjectForm
        {...options}
        initial={{
          id: project.id,
          name: project.name,
          clientId: project.clientId,
          engagementId: project.engagementId,
          siteAddress: project.siteAddress,
          scheduledDate: project.scheduledDate,
          leadMembershipId: project.leadMembershipId,
          summary: project.summary,
        }}
      />
      {canCtx("delete", "project", ctx) && (
        <div className="space-y-2 border-t border-border pt-5">
          <ArchiveButton projectId={project.id} />
          <DeleteWalkButton projectId={project.id} />
        </div>
      )}
    </div>
  );
}
