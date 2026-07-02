"use client";

/**
 * Inline-toggle editor for the project header fields that change
 * during the project lifecycle: status, health, dates, PM, lead, etc.
 *
 * Collapsed state shows nothing — the project page already displays
 * these values in the static header card above. This component only
 * surfaces when the operator clicks Edit, so it doesn't double up the
 * read-only display.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  archiveProject,
  deleteProject,
  updateProject,
} from "@/server/actions/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Status =
  | "planning"
  | "in_progress"
  | "on_hold"
  | "blocked"
  | "completed"
  | "cancelled";
type Health = "green" | "amber" | "red";
type Priority = "low" | "normal" | "high" | "critical";
type Member = { id: string; fullName: string | null; email: string };

export type ProjectHeaderEditable = {
  id: string;
  name: string;
  status: Status;
  health: Health;
  priority: Priority;
  summary: string | null;
  scopeMd: string | null;
  primaryPmMembershipId: string | null;
  leadEngineerMembershipId: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  budgetCents: number | null;
  contractTypeLabel: string | null;
  totalEstimatedHours: number | null;
  totalActualHours: number | null;
  archivedAt: Date | string | null;
};

export function ProjectHeaderEditor({
  project,
  members,
  canEdit,
}: {
  project: ProjectHeaderEditable;
  members: Member[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const [form, setForm] = useState(project);
  const update = <K extends keyof ProjectHeaderEditable>(
    k: K,
    v: ProjectHeaderEditable[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = () => {
    start(async () => {
      const r = await updateProject({
        projectId: project.id,
        name: form.name,
        status: form.status,
        health: form.health,
        priority: form.priority,
        summary: form.summary,
        scopeMd: form.scopeMd,
        primaryPmMembershipId: form.primaryPmMembershipId,
        leadEngineerMembershipId: form.leadEngineerMembershipId,
        plannedStartDate: form.plannedStartDate,
        plannedEndDate: form.plannedEndDate,
        actualStartDate: form.actualStartDate,
        actualEndDate: form.actualEndDate,
        budgetCents: form.budgetCents,
        contractTypeLabel: form.contractTypeLabel,
        totalEstimatedHours: form.totalEstimatedHours,
        totalActualHours: form.totalActualHours,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Saved");
      setEditing(false);
      router.refresh();
    });
  };

  const onArchive = (restore: boolean) => {
    start(async () => {
      const r = await archiveProject({ projectId: project.id, restore });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(restore ? "Restored" : "Archived");
      router.refresh();
    });
  };

  const onDelete = () => {
    if (
      !confirm(
        "Permanently delete this project, all milestones, tasks, status updates, and documents? Cannot be undone.",
      )
    )
      return;
    start(async () => {
      const r = await deleteProject({ projectId: project.id });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Deleted");
      router.push("/projects");
    });
  };

  if (!editing) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="text-xs text-muted-foreground">
            {project.contractTypeLabel && <>{project.contractTypeLabel} · </>}
            {project.totalEstimatedHours != null
              ? `${project.totalEstimatedHours}h estimated`
              : "No hour estimate"}
            {project.totalActualHours != null && (
              <> · {project.totalActualHours}h actual</>
            )}
            {project.budgetCents != null && (
              <> · ${(project.budgetCents / 100).toLocaleString()} budget</>
            )}
            {project.scopeMd && <> · scope on file</>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1">
              {project.archivedAt ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onArchive(true)}
                  disabled={pending}
                >
                  <ArchiveRestore className="mr-1 size-3.5" /> Restore
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onArchive(false)}
                  disabled={pending}
                >
                  <Archive className="mr-1 size-3.5" /> Archive
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={pending}
              >
                <Pencil className="mr-1 size-3.5" /> Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1 block text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Status</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.status}
              onChange={(e) => update("status", e.target.value as Status)}
            >
              <option value="planning">Planning</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Health</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.health}
              onChange={(e) => update("health", e.target.value as Health)}
            >
              <option value="green">🟢 Green</option>
              <option value="amber">🟡 Amber</option>
              <option value="red">🔴 Red</option>
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Priority</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.priority}
              onChange={(e) => update("priority", e.target.value as Priority)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Contract type</Label>
            <Input
              value={form.contractTypeLabel ?? ""}
              onChange={(e) =>
                update("contractTypeLabel", e.target.value || null)
              }
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Planned start</Label>
            <DateField
              value={form.plannedStartDate ?? ""}
              onChange={(v) => update("plannedStartDate", v || null)}
              className="w-full"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Planned end</Label>
            <DateField
              value={form.plannedEndDate ?? ""}
              onChange={(v) => update("plannedEndDate", v || null)}
              className="w-full"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Actual start</Label>
            <DateField
              value={form.actualStartDate ?? ""}
              onChange={(v) => update("actualStartDate", v || null)}
              className="w-full"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Actual end</Label>
            <DateField
              value={form.actualEndDate ?? ""}
              onChange={(v) => update("actualEndDate", v || null)}
              className="w-full"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Project manager</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.primaryPmMembershipId ?? ""}
              onChange={(e) =>
                update("primaryPmMembershipId", e.target.value || null)
              }
            >
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Lead engineer</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.leadEngineerMembershipId ?? ""}
              onChange={(e) =>
                update("leadEngineerMembershipId", e.target.value || null)
              }
            >
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Estimated hours</Label>
            <Input
              type="number"
              min={0}
              value={form.totalEstimatedHours ?? ""}
              onChange={(e) =>
                update(
                  "totalEstimatedHours",
                  e.target.value === "" ? null : parseInt(e.target.value, 10),
                )
              }
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Actual hours</Label>
            <Input
              type="number"
              min={0}
              value={form.totalActualHours ?? ""}
              onChange={(e) =>
                update(
                  "totalActualHours",
                  e.target.value === "" ? null : parseInt(e.target.value, 10),
                )
              }
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Budget (cents)</Label>
            <Input
              type="number"
              min={0}
              value={form.budgetCents ?? ""}
              onChange={(e) =>
                update(
                  "budgetCents",
                  e.target.value === "" ? null : parseInt(e.target.value, 10),
                )
              }
              placeholder="e.g. 1500000 = $15,000"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1 block text-xs">Summary</Label>
            <Input
              value={form.summary ?? ""}
              onChange={(e) => update("summary", e.target.value || null)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1 block text-xs">Scope (markdown)</Label>
            <Textarea
              rows={6}
              value={form.scopeMd ?? ""}
              onChange={(e) => update("scopeMd", e.target.value || null)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setForm(project);
                setEditing(false);
              }}
              disabled={pending}
            >
              <X className="mr-1 size-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 size-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
