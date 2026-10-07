import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth-helpers";
import { loadProjectFormOptions } from "@/lib/discovery/form-options";
import { ProjectForm } from "@/components/discovery/project-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New site walk" };

export default async function NewDiscoveryPage() {
  const ctx = await requirePermission("update", "project");
  const options = await loadProjectFormOptions(ctx.organization.id);
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/discovery" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> Site discovery
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New site walk</h1>
        <p className="text-sm text-muted-foreground">
          Pre-install discovery checklist — 28 sections. You can fill it in any order, offline, and come back later.
        </p>
      </div>
      <ProjectForm {...options} />
    </div>
  );
}
