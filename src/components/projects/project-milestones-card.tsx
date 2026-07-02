"use client";

/**
 * Milestones + tasks card.
 *
 * One section per milestone (rendered in `position` order). Inside each
 * section, tasks belonging to that milestone. Unassigned tasks (no
 * milestone) land in a dedicated "No milestone" group at the bottom.
 *
 * Inline interactions:
 *   • Click the task checkbox to toggle done/todo
 *   • Click "Add task" under a milestone to open an inline composer
 *   • Click "Add milestone" at the bottom to add a new one
 *   • Per-row "…" menu opens an edit dialog (deferred to v1.1 — for
 *     v1 we surface the most common toggles inline)
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  createMilestone,
  createTask,
  deleteMilestone,
  deleteTask,
  updateMilestone,
  updateTask,
} from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import {
  ProjectCommentsThread,
  type AttachmentRow,
  type CommentRow,
} from "./project-comments-thread";
import {
  TaskDependenciesPanel,
  type DependencyEdge,
  type TaskLite,
} from "./task-dependencies-panel";
import { SignoffPanel } from "./signoff-panel";

type Member = { id: string; fullName: string | null; email: string };

/**
 * Client-side stakeholder, projected down to what the picker needs.
 * The full stakeholder shape lives in project_stakeholders.
 */
export type StakeholderLite = {
  id: string;
  name: string;
  roleLabel: string | null;
};

/**
 * Sign-off fields shared by tasks AND milestones — both surface the
 * same approval workflow. Bundled into one mixin so the row types
 * stay clean.
 */
type SignoffFields = {
  requiresSignoff: boolean;
  signedOffAt: Date | string | null;
  signedOffByStakeholderId: string | null;
  signoffNotes: string | null;
};

type MilestoneRow = SignoffFields & {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: "planned" | "in_progress" | "completed" | "missed";
  position: number;
  clientVisible: boolean;
  completedAt: Date | string | null;
  assigneeMembershipId: string | null;
  stakeholderId: string | null;
};
type TaskRow = SignoffFields & {
  id: string;
  milestoneId: string | null;
  /** NULL = top-level task; non-NULL = subtask of that parent task. */
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  assigneeMembershipId: string | null;
  stakeholderId: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  position: number;
  completedAt: Date | string | null;
};

const TASK_STATUS_LABEL: Record<TaskRow["status"], string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const MILESTONE_STATUS_LABEL: Record<MilestoneRow["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  missed: "Missed",
};

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00Z") : d;
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ProjectMilestonesCard({
  projectId,
  milestones,
  tasks,
  members,
  stakeholders,
  canEdit,
  taskComments,
  taskAttachments,
  milestoneComments,
  milestoneAttachments,
  taskBlockedBy,
  taskBlocks,
}: {
  projectId: string;
  milestones: MilestoneRow[];
  tasks: TaskRow[];
  members: Member[];
  /** Project stakeholders — fed into the picker on each task / milestone.
   *  Empty list = no picker shown (operator hasn't added any yet). */
  stakeholders: StakeholderLite[];
  canEdit: boolean;
  /** Comments per task id. Optional — if empty, the task expansion
   *  panel still renders so the operator can post the first comment. */
  taskComments?: Map<string, CommentRow[]>;
  taskAttachments?: Map<string, AttachmentRow[]>;
  /** Comments at the milestone level (not under any task). */
  milestoneComments?: Map<string, CommentRow[]>;
  milestoneAttachments?: Map<string, AttachmentRow[]>;
  /** For each task id, the predecessors it waits on (blockedBy edges). */
  taskBlockedBy?: Map<string, DependencyEdge[]>;
  /** For each task id, the dependents waiting on IT (blocks edges). */
  taskBlocks?: Map<string, DependencyEdge[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [composingFor, setComposingFor] = useState<string | "no-milestone" | null>(null);
  const [composeTitle, setComposeTitle] = useState("");
  /** Open subtask composer for which parent task id. */
  const [subtaskComposingFor, setSubtaskComposingFor] =
    useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [showNewMilestone, setShowNewMilestone] = useState(false);
  const [newMsName, setNewMsName] = useState("");
  const [newMsDate, setNewMsDate] = useState("");
  const [newMsAssignee, setNewMsAssignee] = useState("");
  /** Set of task IDs with the comments/attachments panel expanded. */
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  /** Set of milestone IDs with the milestone-level comments panel expanded. */
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(
    new Set(),
  );

  const toggleTaskExpansion = (id: string) =>
    setExpandedTasks((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleMilestoneExpansion = (id: string) =>
    setExpandedMilestones((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Bucket TOP-LEVEL tasks (parentTaskId === null) under their
  // milestone. Subtasks render under their parent task, not the
  // milestone, so they don't appear in the milestone bucket.
  const tasksByMs = new Map<string | null, TaskRow[]>();
  for (const t of tasks) {
    if (t.parentTaskId) continue;
    const key = t.milestoneId;
    const list = tasksByMs.get(key) ?? [];
    list.push(t);
    tasksByMs.set(key, list);
  }
  // And map subtasks by their parent task id.
  const subtasksByParent = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!t.parentTaskId) continue;
    const list = subtasksByParent.get(t.parentTaskId) ?? [];
    list.push(t);
    subtasksByParent.set(t.parentTaskId, list);
  }
  for (const list of subtasksByParent.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const onToggleTask = (t: TaskRow) => {
    if (!canEdit) return;
    const newStatus = t.status === "done" ? "todo" : "done";
    start(async () => {
      const r = await updateTask({ taskId: t.id, status: newStatus });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onToggleMilestoneStatus = (m: MilestoneRow) => {
    if (!canEdit) return;
    const cycle: Record<MilestoneRow["status"], MilestoneRow["status"]> = {
      planned: "in_progress",
      in_progress: "completed",
      completed: "planned",
      missed: "planned",
    };
    start(async () => {
      const r = await updateMilestone({
        milestoneId: m.id,
        status: cycle[m.status],
      });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onAddTask = (milestoneId: string | null) => {
    if (!composeTitle.trim()) return;
    start(async () => {
      const r = await createTask({
        projectId,
        milestoneId: milestoneId ?? undefined,
        title: composeTitle.trim(),
        position: (tasksByMs.get(milestoneId)?.length ?? 0),
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setComposeTitle("");
      setComposingFor(null);
      router.refresh();
    });
  };

  const onAddSubtask = (parentTaskId: string) => {
    if (!subtaskTitle.trim()) return;
    start(async () => {
      const r = await createTask({
        projectId,
        parentTaskId,
        title: subtaskTitle.trim(),
        position: subtasksByParent.get(parentTaskId)?.length ?? 0,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setSubtaskTitle("");
      setSubtaskComposingFor(null);
      router.refresh();
    });
  };

  const onDeleteTask = (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    start(async () => {
      const r = await deleteTask({ taskId });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onAddMilestone = () => {
    if (!newMsName.trim()) return;
    start(async () => {
      const r = await createMilestone({
        projectId,
        name: newMsName.trim(),
        targetDate: newMsDate || null,
        assigneeMembershipId: newMsAssignee || null,
        position: milestones.length,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setNewMsName("");
      setNewMsDate("");
      setNewMsAssignee("");
      setShowNewMilestone(false);
      router.refresh();
    });
  };

  const onSetMilestoneAssignee = (milestoneId: string, membershipId: string) => {
    start(async () => {
      const r = await updateMilestone({
        milestoneId,
        assigneeMembershipId: membershipId || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onSetTaskAssignee = (taskId: string, membershipId: string) => {
    start(async () => {
      const r = await updateTask({
        taskId,
        assigneeMembershipId: membershipId || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onSetTaskStakeholder = (taskId: string, stakeholderId: string) => {
    start(async () => {
      const r = await updateTask({
        taskId,
        stakeholderId: stakeholderId || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onSetMilestoneStakeholder = (
    milestoneId: string,
    stakeholderId: string,
  ) => {
    start(async () => {
      const r = await updateMilestone({
        milestoneId,
        stakeholderId: stakeholderId || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onSetTaskDueDate = (taskId: string, dueDate: string) => {
    start(async () => {
      const r = await updateTask({
        taskId,
        dueDate: dueDate || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onDeleteMilestone = (m: MilestoneRow) => {
    if (
      !confirm(
        `Delete milestone "${m.name}"? Tasks under it stay (they become unassigned).`,
      )
    )
      return;
    start(async () => {
      const r = await deleteMilestone({ milestoneId: m.id });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const sections: Array<{
    milestone: MilestoneRow | null;
    taskList: TaskRow[];
  }> = milestones.map((m) => ({
    milestone: m,
    taskList: (tasksByMs.get(m.id) ?? []).sort(
      (a, b) => a.position - b.position,
    ),
  }));
  const orphans = (tasksByMs.get(null) ?? []).sort(
    (a, b) => a.position - b.position,
  );
  if (orphans.length > 0) sections.push({ milestone: null, taskList: orphans });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Milestones & tasks</CardTitle>
          {canEdit && !showNewMilestone && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewMilestone(true)}
              disabled={pending}
            >
              <Plus className="mr-1 size-3.5" /> Milestone
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showNewMilestone && (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-2">
            <Input
              value={newMsName}
              onChange={(e) => setNewMsName(e.target.value)}
              placeholder="Milestone name"
              autoFocus
            />
            <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
              <DateField value={newMsDate} onChange={setNewMsDate} />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={newMsAssignee}
                onChange={(e) => setNewMsAssignee(e.target.value)}
              >
                <option value="">No assignee</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName ?? m.email}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={onAddMilestone}
                  disabled={pending || !newMsName.trim()}
                >
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewMsName("");
                    setNewMsDate("");
                    setNewMsAssignee("");
                    setShowNewMilestone(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {sections.length === 0 && !showNewMilestone && (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No milestones yet. Add one to start organizing tasks.
          </div>
        )}

        {sections.map(({ milestone, taskList }) => (
          <div
            key={milestone?.id ?? "no-milestone"}
            className="rounded-md border bg-card"
          >
            {/* Milestone header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex items-center gap-2">
                {milestone ? (
                  <>
                    <span className="inline-flex items-center rounded-sm border border-orange-600 bg-orange-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                      Milestone
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleMilestoneStatus(milestone)}
                      disabled={!canEdit || pending}
                      className="text-xs"
                      title="Cycle status"
                    >
                      <Badge
                        variant="outline"
                        className={
                          milestone.status === "completed"
                            ? "border-emerald-500/40 text-emerald-700"
                            : milestone.status === "in_progress"
                              ? "border-amber-500/40 text-amber-700"
                              : milestone.status === "missed"
                                ? "border-rose-500/40 text-rose-700"
                                : ""
                        }
                      >
                        {MILESTONE_STATUS_LABEL[milestone.status]}
                      </Badge>
                    </button>
                    <span className="font-semibold">{milestone.name}</span>
                    {milestone.targetDate && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        {formatDate(milestone.targetDate)}
                      </span>
                    )}
                    {canEdit ? (
                      <MilestoneAssigneeSelect
                        milestoneId={milestone.id}
                        currentMembershipId={milestone.assigneeMembershipId}
                        members={members}
                        pending={pending}
                        onChange={(id) =>
                          onSetMilestoneAssignee(milestone.id, id)
                        }
                      />
                    ) : milestone.assigneeMembershipId ? (
                      <AssigneeBadge
                        membershipId={milestone.assigneeMembershipId}
                        members={members}
                      />
                    ) : null}
                    {canEdit && stakeholders.length > 0 ? (
                      <MilestoneStakeholderSelect
                        currentStakeholderId={milestone.stakeholderId}
                        stakeholders={stakeholders}
                        pending={pending}
                        onChange={(id) =>
                          onSetMilestoneStakeholder(milestone.id, id)
                        }
                      />
                    ) : milestone.stakeholderId ? (
                      <StakeholderBadge
                        stakeholderId={milestone.stakeholderId}
                        stakeholders={stakeholders}
                      />
                    ) : null}
                    {!milestone.clientVisible && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-muted-foreground"
                      >
                        Internal
                      </Badge>
                    )}
                    {milestone.signedOffAt ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-sm border border-emerald-600 bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        title={`Signed off ${new Date(milestone.signedOffAt).toLocaleDateString()}`}
                      >
                        <CheckCircle2 className="size-3" />
                        Signed off
                      </span>
                    ) : milestone.requiresSignoff ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-sm border border-amber-600 bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        title="Stakeholder sign-off required before closure"
                      >
                        <ShieldCheck className="size-3" />
                        Awaiting sign-off
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">
                    No milestone
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {milestone && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleMilestoneExpansion(milestone.id)}
                    className="h-7 text-xs"
                    title={
                      expandedMilestones.has(milestone.id)
                        ? "Hide milestone comments"
                        : "Show milestone comments"
                    }
                  >
                    <MessageSquare className="mr-1 size-3" />
                    {milestoneComments?.get(milestone.id)?.length ?? 0}
                    {(milestoneAttachments?.get(milestone.id)?.length ?? 0) >
                      0 && (
                      <>
                        <Paperclip className="ml-1 size-3" />
                        {milestoneAttachments?.get(milestone.id)?.length ?? 0}
                      </>
                    )}
                  </Button>
                )}
                {canEdit && milestone && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteMilestone(milestone)}
                    disabled={pending}
                    className="h-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Milestone-level comments/attachments panel +
                stakeholder sign-off block. */}
            {milestone && expandedMilestones.has(milestone.id) && (
              <div className="space-y-3 border-b bg-muted/10 px-3 py-3">
                <SignoffPanel
                  scope="milestone"
                  rowId={milestone.id}
                  requiresSignoff={milestone.requiresSignoff}
                  signedOffAt={
                    milestone.signedOffAt
                      ? typeof milestone.signedOffAt === "string"
                        ? milestone.signedOffAt
                        : milestone.signedOffAt.toISOString()
                      : null
                  }
                  signedOffByStakeholderId={milestone.signedOffByStakeholderId}
                  signoffNotes={milestone.signoffNotes}
                  assignedStakeholderId={milestone.stakeholderId}
                  stakeholders={stakeholders}
                  canEdit={canEdit}
                />
                <ProjectCommentsThread
                  projectId={projectId}
                  milestoneId={milestone.id}
                  comments={milestoneComments?.get(milestone.id) ?? []}
                  attachments={milestoneAttachments?.get(milestone.id) ?? []}
                  canEdit={canEdit}
                  compact
                />
              </div>
            )}

            {/* Tasks */}
            <div>
              {taskList.length === 0 && (
                <div className="px-3 py-3 text-xs italic text-muted-foreground">
                  No tasks yet
                </div>
              )}
              {/* Flatten: each top-level task is followed by its subtasks
                  + the inline subtask composer if open. Single .map keeps
                  the render shape consistent for tasks AND subtasks while
                  still letting us slot the per-parent composer in between. */}
              {taskList.flatMap((parent) => {
                const subtasksHere = subtasksByParent.get(parent.id) ?? [];
                const composerNode =
                  canEdit && subtaskComposingFor === parent.id ? (
                    <div
                      key={`composer-${parent.id}`}
                      className="border-b bg-muted/10 pl-8 pr-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          value={subtaskTitle}
                          onChange={(e) => setSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onAddSubtask(parent.id);
                            }
                            if (e.key === "Escape") {
                              setSubtaskComposingFor(null);
                              setSubtaskTitle("");
                            }
                          }}
                          placeholder="Subtask title"
                          autoFocus
                          className="h-8 text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => onAddSubtask(parent.id)}
                          disabled={pending || !subtaskTitle.trim()}
                          className="h-8"
                        >
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSubtaskComposingFor(null);
                            setSubtaskTitle("");
                          }}
                          className="h-8"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null;
                return [
                  { kind: "task" as const, task: parent, isSubtask: false },
                  ...subtasksHere.map((st) => ({
                    kind: "task" as const,
                    task: st,
                    isSubtask: true,
                  })),
                  composerNode
                    ? { kind: "composer" as const, node: composerNode }
                    : null,
                ].filter((x): x is NonNullable<typeof x> => x !== null);
              }).map((entry) => {
                if (entry.kind === "composer") return entry.node;
                const t = entry.task;
                const isSubtask = entry.isSubtask;
                const assignee = members.find(
                  (m) => m.id === t.assigneeMembershipId,
                );
                const done = t.status === "done";
                const isExpanded = expandedTasks.has(t.id);
                const commentCount = taskComments?.get(t.id)?.length ?? 0;
                const attachmentCount =
                  taskAttachments?.get(t.id)?.length ?? 0;
                const blockedByEdges = taskBlockedBy?.get(t.id) ?? [];
                const blocksEdges = taskBlocks?.get(t.id) ?? [];
                // "Waiting on" = blocked by at least one incomplete
                // predecessor. Drives the ⚠️ chip on the collapsed row.
                const waitingOn = blockedByEdges.filter(
                  (e) => e.otherTaskStatus !== "done",
                );
                const subtaskCount =
                  subtasksByParent.get(t.id)?.length ?? 0;
                return (
                  <div
                    key={t.id}
                    className={`border-b last:border-b-0 ${isSubtask ? "border-l-4 border-l-muted-foreground/20 bg-muted/5 pl-4" : ""}`}
                  >
                    <div className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30">
                      <button
                        type="button"
                        onClick={() => onToggleTask(t)}
                        disabled={!canEdit || pending}
                        className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border ${
                          done
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-input bg-background"
                        } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                        title={done ? "Mark as todo" : "Mark as done"}
                      >
                        {done && <Check className="size-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white ${
                              isSubtask
                                ? "border border-violet-600 bg-violet-600"
                                : "border border-sky-600 bg-sky-600"
                            }`}
                          >
                            {isSubtask ? "Subtask" : "Task"}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleTaskExpansion(t.id)}
                            className={`flex-1 text-left text-sm ${done ? "text-muted-foreground line-through" : ""}`}
                            title="Click to show details + comments"
                          >
                            {t.title}
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded-full bg-muted/40 px-1.5 py-0.5">
                            {TASK_STATUS_LABEL[t.status]}
                          </span>
                          {!isSubtask && subtaskCount > 0 && (
                            <Badge
                              variant="outline"
                              className="gap-1 px-1.5 py-0 text-[10px]"
                              title={`${subtaskCount} subtask${subtaskCount === 1 ? "" : "s"}`}
                            >
                              <span className="text-violet-600" aria-hidden>
                                ●
                              </span>
                              {subtaskCount} subtask
                              {subtaskCount === 1 ? "" : "s"}
                            </Badge>
                          )}
                          {canEdit ? (
                            <TaskAssigneeSelect
                              currentMembershipId={t.assigneeMembershipId}
                              members={members}
                              pending={pending}
                              onChange={(id) => onSetTaskAssignee(t.id, id)}
                            />
                          ) : assignee ? (
                            <span className="inline-flex items-center gap-0.5">
                              <UserRound className="size-2.5" />
                              {assignee.fullName ?? assignee.email}
                            </span>
                          ) : null}
                          {canEdit && stakeholders.length > 0 ? (
                            <TaskStakeholderSelect
                              currentStakeholderId={t.stakeholderId}
                              stakeholders={stakeholders}
                              pending={pending}
                              onChange={(id) =>
                                onSetTaskStakeholder(t.id, id)
                              }
                            />
                          ) : t.stakeholderId ? (
                            <StakeholderBadge
                              stakeholderId={t.stakeholderId}
                              stakeholders={stakeholders}
                            />
                          ) : null}
                          {canEdit ? (
                            <TaskDueDateInput
                              value={t.dueDate ?? ""}
                              pending={pending}
                              onChange={(v) => onSetTaskDueDate(t.id, v)}
                            />
                          ) : t.dueDate ? (
                            <span>· due {formatDate(t.dueDate)}</span>
                          ) : null}
                          {t.estimatedHours != null && (
                            <span>· {t.estimatedHours}h est</span>
                          )}
                          {(commentCount > 0 || attachmentCount > 0) && (
                            <span className="inline-flex items-center gap-0.5">
                              · {commentCount > 0 && (
                                <>
                                  <MessageSquare className="size-2.5" />
                                  {commentCount}
                                </>
                              )}
                              {attachmentCount > 0 && (
                                <>
                                  <Paperclip className="size-2.5" />
                                  {attachmentCount}
                                </>
                              )}
                            </span>
                          )}
                          {waitingOn.length > 0 && (
                            <Badge
                              variant="outline"
                              className="gap-1 px-1.5 py-0 text-[10px]"
                              title={waitingOn
                                .map((e) => e.otherTaskTitle)
                                .join(" · ")}
                            >
                              <AlertTriangle className="size-2.5 text-amber-600" />
                              Waiting on {waitingOn.length}
                            </Badge>
                          )}
                          {blocksEdges.length > 0 && (
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] text-muted-foreground"
                              title={blocksEdges
                                .map((e) => e.otherTaskTitle)
                                .join(" · ")}
                            >
                              Blocks {blocksEdges.length}
                            </Badge>
                          )}
                          {/* Sign-off state badge — shows whether
                              this row needs / has stakeholder approval. */}
                          {t.signedOffAt ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-sm border border-emerald-600 bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                              title={`Signed off ${new Date(t.signedOffAt).toLocaleDateString()}`}
                            >
                              <CheckCircle2 className="size-3" />
                              Signed off
                            </span>
                          ) : t.requiresSignoff ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-sm border border-amber-600 bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                              title="Stakeholder sign-off required before closure"
                            >
                              <ShieldCheck className="size-3" />
                              Awaiting sign-off
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTaskExpansion(t.id)}
                        className="h-6 text-xs text-muted-foreground"
                        title={isExpanded ? "Collapse" : "Expand for details"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </Button>
                      {/* "+ Subtask" only on PARENT tasks. Subtasks
                          can't have their own subtasks (one level only). */}
                      {canEdit && !isSubtask && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSubtaskComposingFor(t.id);
                            setSubtaskTitle("");
                          }}
                          disabled={pending}
                          className="h-6 text-[10px] text-violet-700 hover:text-violet-900 dark:text-violet-300"
                          title="Add subtask"
                        >
                          <Plus className="size-3" />
                          Subtask
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteTask(t.id)}
                          disabled={pending}
                          className="h-6 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="border-t bg-muted/10 px-3 py-3 pl-11 space-y-3">
                        {t.description && (
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            {t.description}
                          </p>
                        )}
                        <TaskDependenciesPanel
                          taskId={t.id}
                          blockedBy={blockedByEdges}
                          blocks={blocksEdges}
                          availableTasks={tasks
                            .filter((other) => other.id !== t.id)
                            .map((other): TaskLite => ({
                              id: other.id,
                              title: other.title,
                              status: other.status,
                            }))}
                          canEdit={canEdit}
                        />
                        <SignoffPanel
                          scope="task"
                          rowId={t.id}
                          requiresSignoff={t.requiresSignoff}
                          signedOffAt={
                            t.signedOffAt
                              ? typeof t.signedOffAt === "string"
                                ? t.signedOffAt
                                : t.signedOffAt.toISOString()
                              : null
                          }
                          signedOffByStakeholderId={t.signedOffByStakeholderId}
                          signoffNotes={t.signoffNotes}
                          assignedStakeholderId={t.stakeholderId}
                          stakeholders={stakeholders}
                          canEdit={canEdit}
                        />
                        <ProjectCommentsThread
                          projectId={projectId}
                          taskId={t.id}
                          comments={taskComments?.get(t.id) ?? []}
                          attachments={taskAttachments?.get(t.id) ?? []}
                          canEdit={canEdit}
                          compact
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Inline task composer */}
              {canEdit && (
                <div className="border-t px-3 py-2">
                  {composingFor ===
                  (milestone?.id ?? "no-milestone") ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={composeTitle}
                        onChange={(e) => setComposeTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onAddTask(milestone?.id ?? null);
                          }
                          if (e.key === "Escape") {
                            setComposingFor(null);
                            setComposeTitle("");
                          }
                        }}
                        placeholder="Task title"
                        autoFocus
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={() => onAddTask(milestone?.id ?? null)}
                        disabled={pending || !composeTitle.trim()}
                        className="h-8"
                      >
                        Add
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setComposingFor(null);
                          setComposeTitle("");
                        }}
                        className="h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setComposingFor(milestone?.id ?? "no-milestone");
                        setComposeTitle("");
                      }}
                      className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="mr-1 size-3" /> Add task
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* --------------- inline-edit helpers --------------- */

/** Read-only assignee chip — used when canEdit=false. */
function AssigneeBadge({
  membershipId,
  members,
}: {
  membershipId: string;
  members: Member[];
}) {
  const m = members.find((x) => x.id === membershipId);
  if (!m) return null;
  return (
    <Badge variant="outline" className="text-[10px]">
      <UserRound className="mr-0.5 size-2.5" />
      {m.fullName ?? m.email}
    </Badge>
  );
}

/** Compact dropdown on the milestone header to pick an assignee. */
function MilestoneAssigneeSelect({
  milestoneId,
  currentMembershipId,
  members,
  pending,
  onChange,
}: {
  milestoneId: string;
  currentMembershipId: string | null;
  members: Member[];
  pending: boolean;
  onChange: (membershipId: string) => void;
}) {
  return (
    <select
      className="h-6 rounded-md border border-input bg-background px-1.5 text-[10px]"
      value={currentMembershipId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
      title={`Milestone ${milestoneId} assignee`}
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.fullName ?? m.email}
        </option>
      ))}
    </select>
  );
}

/** Tight inline dropdown for picking the task's assignee. */
function TaskAssigneeSelect({
  currentMembershipId,
  members,
  pending,
  onChange,
}: {
  currentMembershipId: string | null;
  members: Member[];
  pending: boolean;
  onChange: (membershipId: string) => void;
}) {
  return (
    <select
      className="h-5 rounded border border-input bg-background px-1 text-[10px]"
      value={currentMembershipId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.fullName ?? m.email}
        </option>
      ))}
    </select>
  );
}

/** Read-only stakeholder chip. Neutral background + amber star so the
 *  name reads in normal foreground text, not low-contrast blue-on-blue. */
function StakeholderBadge({
  stakeholderId,
  stakeholders,
}: {
  stakeholderId: string;
  stakeholders: StakeholderLite[];
}) {
  const s = stakeholders.find((x) => x.id === stakeholderId);
  if (!s) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 text-[10px]"
      title={s.roleLabel ?? undefined}
    >
      <span className="text-amber-500" aria-hidden>
        ★
      </span>
      {s.name}
    </Badge>
  );
}

/** Compact stakeholder dropdown for milestone header. Default-styled
 *  select (white/card background, normal text) with a thin neutral
 *  border — readability matches the assignee picker next to it. */
function MilestoneStakeholderSelect({
  currentStakeholderId,
  stakeholders,
  pending,
  onChange,
}: {
  currentStakeholderId: string | null;
  stakeholders: StakeholderLite[];
  pending: boolean;
  onChange: (stakeholderId: string) => void;
}) {
  return (
    <select
      className="h-6 rounded-md border border-input bg-background px-1.5 text-[10px] text-foreground"
      value={currentStakeholderId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
      title="Client-side stakeholder"
    >
      <option value="">★ Stakeholder…</option>
      {stakeholders.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.roleLabel ? ` — ${s.roleLabel}` : ""}
        </option>
      ))}
    </select>
  );
}

/** Tight inline stakeholder dropdown for task rows. */
function TaskStakeholderSelect({
  currentStakeholderId,
  stakeholders,
  pending,
  onChange,
}: {
  currentStakeholderId: string | null;
  stakeholders: StakeholderLite[];
  pending: boolean;
  onChange: (stakeholderId: string) => void;
}) {
  return (
    <select
      className="h-5 rounded border border-input bg-background px-1 text-[10px] text-foreground"
      value={currentStakeholderId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
    >
      <option value="">★ Stakeholder…</option>
      {stakeholders.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.roleLabel ? ` — ${s.roleLabel}` : ""}
        </option>
      ))}
    </select>
  );
}

/** Inline date picker for the task's due date. Uses DateField in
 *  compact mode so the operator can still type the year directly. */
function TaskDueDateInput({
  value,
  pending,
  onChange,
}: {
  value: string;
  pending: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <DateField
      value={value}
      onChange={onChange}
      disabled={pending}
      compact
      placeholder="due MM/DD/YYYY"
    />
  );
}
