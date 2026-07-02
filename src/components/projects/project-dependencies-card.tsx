"use client";

/**
 * Project dependencies card.
 *
 * Two sections on the project detail page:
 *   "This project depends on:" — predecessors (other projects that
 *     must finish first). Removable here.
 *   "Other projects waiting on this one:" — successors. Read-only at
 *     this end; remove from the successor's page if needed.
 *
 * Picker shows other org projects, with code + name + client. Self,
 * already-linked, and cyclic options would be rejected server-side
 * — we still pre-filter the trivially impossible cases for nicer UX.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Link2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createProjectDependency,
  deleteProjectDependency,
} from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProjectStatus =
  | "planning"
  | "in_progress"
  | "on_hold"
  | "blocked"
  | "completed"
  | "cancelled";

export type ProjectLite = {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  clientName: string;
};

export type ProjectDependencyEdge = {
  id: string;
  /** ID of the OTHER project. */
  otherProjectId: string;
  otherProjectCode: string;
  otherProjectName: string;
  otherProjectStatus: ProjectStatus;
  otherClientName: string;
};

export function ProjectDependenciesCard({
  projectId,
  dependsOn,
  blocks,
  availableProjects,
  canEdit,
}: {
  projectId: string;
  dependsOn: ProjectDependencyEdge[];
  blocks: ProjectDependencyEdge[];
  availableProjects: ProjectLite[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState("");

  const linkedIds = new Set([
    projectId,
    ...dependsOn.map((d) => d.otherProjectId),
  ]);
  const pickerOptions = availableProjects.filter((p) => !linkedIds.has(p.id));

  const onAdd = () => {
    if (!picked) {
      toast.error("Pick a project this one waits on first");
      return;
    }
    start(async () => {
      const r = await createProjectDependency({
        dependentProjectId: projectId,
        predecessorProjectId: picked,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setPicked("");
      setAdding(false);
      router.refresh();
    });
  };

  const onRemove = (depId: string) => {
    start(async () => {
      const r = await deleteProjectDependency({ dependencyId: depId });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  // If nothing to show + can't edit, hide the card entirely.
  if (!canEdit && dependsOn.length === 0 && blocks.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" />
          Project dependencies
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DependencySection
          label="This project depends on"
          edges={dependsOn}
          emptyLabel="No prerequisites — this project can start on its own."
          removable={canEdit}
          pending={pending}
          highlight={(e) => e.otherProjectStatus !== "completed"}
          onRemove={onRemove}
        />

        {canEdit && (
          <div className="space-y-2">
            {adding ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 p-2">
                <select
                  className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                >
                  <option value="">Pick a project this one waits on…</option>
                  {pickerOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name} ({p.clientName})
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={onAdd}
                  disabled={pending || !picked}
                >
                  {pending ? (
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                  ) : null}
                  Link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setPicked("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdding(true)}
                disabled={pending || pickerOptions.length === 0}
              >
                <Plus className="mr-1 size-3.5" />
                Add prerequisite project
              </Button>
            )}
          </div>
        )}

        {blocks.length > 0 && (
          <DependencySection
            label="Other projects waiting on this one"
            edges={blocks}
            emptyLabel=""
            removable={false}
            pending={pending}
            highlight={() => false}
            onRemove={() => {}}
          />
        )}
      </CardContent>
    </Card>
  );
}

function DependencySection({
  label,
  edges,
  emptyLabel,
  removable,
  pending,
  highlight,
  onRemove,
}: {
  label: string;
  edges: ProjectDependencyEdge[];
  emptyLabel: string;
  removable: boolean;
  pending: boolean;
  highlight: (e: ProjectDependencyEdge) => boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {edges.length === 0 ? (
        emptyLabel ? (
          <div className="rounded-md border border-dashed py-3 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : null
      ) : (
        <div className="space-y-1.5">
          {edges.map((e) => (
            <ProjectEdgeRow
              key={e.id}
              edge={e}
              removable={removable}
              pending={pending}
              flagged={highlight(e)}
              onRemove={() => onRemove(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectEdgeRow({
  edge,
  removable,
  pending,
  flagged,
  onRemove,
}: {
  edge: ProjectDependencyEdge;
  removable: boolean;
  pending: boolean;
  flagged: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border bg-card p-2 ${
        flagged
          ? "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10"
          : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {flagged && (
          <AlertTriangle className="size-3.5 text-amber-600" />
        )}
        <Badge variant="secondary" className="text-xs">
          {edge.otherProjectCode}
        </Badge>
        <Link
          href={`/projects/${edge.otherProjectId}`}
          className="truncate text-sm font-medium text-primary hover:underline"
        >
          {edge.otherProjectName}
        </Link>
        <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs text-muted-foreground">
          {edge.otherClientName} · {edge.otherProjectStatus}
        </span>
      </div>
      {removable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={pending}
          className="h-6 text-muted-foreground hover:text-destructive"
          title="Remove this dependency"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
