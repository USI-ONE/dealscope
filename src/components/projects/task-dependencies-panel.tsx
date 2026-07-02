"use client";

/**
 * Task dependencies UI — rendered inside the expanded task panel on
 * the milestones card.
 *
 * Shows:
 *   • "Blocked by:" — chips for every task this one waits on.
 *     Operators see incomplete predecessors first (with a ⚠️) so the
 *     blocking work is obvious.
 *   • "Blocks:" — chips for every task that's waiting on THIS one.
 *     Read-only here — to remove a blocks relationship, open the
 *     dependent task and remove it from its "Blocked by" list.
 *   • "+ Add dependency" — small inline form with a project-scoped
 *     task picker. Self, already-linked, and would-be-cyclic options
 *     stay in the picker but the server action rejects them so the
 *     operator gets a clear error message.
 *
 * Cycle prevention is server-side (BFS in createTaskDependency); the
 * client just optimistically renders and trusts the server's verdict.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Link2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  createTaskDependency,
  deleteTaskDependency,
} from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskLite = {
  id: string;
  title: string;
  status: TaskStatus;
};

export type DependencyEdge = {
  id: string;
  /** Title of the OTHER task (predecessor for "blocked by", dependent
   *  for "blocks"). */
  otherTaskId: string;
  otherTaskTitle: string;
  otherTaskStatus: TaskStatus;
};

export function TaskDependenciesPanel({
  taskId,
  blockedBy,
  blocks,
  availableTasks,
  canEdit,
}: {
  taskId: string;
  /** Tasks this one waits on. */
  blockedBy: DependencyEdge[];
  /** Tasks waiting on this one. */
  blocks: DependencyEdge[];
  /** All other tasks in the same project — feeds the picker. */
  availableTasks: TaskLite[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [pickedPredecessor, setPickedPredecessor] = useState("");

  // Don't offer self or already-linked predecessors in the picker.
  const linkedIds = new Set([
    taskId,
    ...blockedBy.map((b) => b.otherTaskId),
  ]);
  const pickerOptions = availableTasks.filter((t) => !linkedIds.has(t.id));

  const onAdd = () => {
    if (!pickedPredecessor) {
      toast.error("Pick a task to depend on first");
      return;
    }
    start(async () => {
      const r = await createTaskDependency({
        dependentTaskId: taskId,
        predecessorTaskId: pickedPredecessor,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setPickedPredecessor("");
      setAdding(false);
      router.refresh();
    });
  };

  const onRemove = (depId: string) => {
    start(async () => {
      const r = await deleteTaskDependency({ dependencyId: depId });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  // Nothing to show + can't edit → render nothing.
  if (!canEdit && blockedBy.length === 0 && blocks.length === 0) return null;

  return (
    <div className="rounded-md border bg-card p-2 space-y-2 text-xs">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Link2 className="size-3" />
        Dependencies
      </div>
      {/* Blocked by */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground">Blocked by:</span>
        {blockedBy.length === 0 && (
          <span className="text-muted-foreground">—</span>
        )}
        {blockedBy.map((b) => (
          <DependencyChip
            key={b.id}
            edge={b}
            removable={canEdit}
            pending={pending}
            highlight={b.otherTaskStatus !== "done"}
            onRemove={() => onRemove(b.id)}
          />
        ))}
        {canEdit && !adding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            disabled={pending || pickerOptions.length === 0}
            className="h-6 text-xs"
          >
            <Plus className="mr-1 size-3" />
            Add
          </Button>
        )}
      </div>
      {adding && canEdit && (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 p-2">
          <select
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            value={pickedPredecessor}
            onChange={(e) => setPickedPredecessor(e.target.value)}
          >
            <option value="">Pick a task this one waits on…</option>
            {pickerOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.status === "done" ? " (done)" : ""}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={onAdd}
            disabled={pending || !pickedPredecessor}
            className="h-8"
          >
            {pending ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : null}
            Link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(false);
              setPickedPredecessor("");
            }}
            className="h-8"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Blocks (read-only at this end) */}
      {blocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground">Blocks:</span>
          {blocks.map((b) => (
            <DependencyChip
              key={b.id}
              edge={b}
              removable={false}
              pending={pending}
              highlight={false}
              onRemove={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DependencyChip({
  edge,
  removable,
  pending,
  highlight,
  onRemove,
}: {
  edge: DependencyEdge;
  removable: boolean;
  pending: boolean;
  highlight: boolean;
  onRemove: () => void;
}) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] ${
        highlight
          ? "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
          : ""
      }`}
      title={edge.otherTaskTitle}
    >
      {highlight && <AlertTriangle className="size-2.5" />}
      <span className="max-w-[280px] truncate">{edge.otherTaskTitle}</span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          className="ml-1 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed"
          title="Remove dependency"
        >
          <X className="size-2.5" />
        </button>
      )}
    </Badge>
  );
}
