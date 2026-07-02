"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Circle, Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  completeMilestone,
  createMilestone,
  createWorkstreamTask,
  deleteMilestone,
  deleteWorkstreamTask,
  updateWorkstreamTask,
} from "@/server/actions/diligence-workstreams";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Task = {
  id: string;
  track: string | null;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "critical";
  ownerName?: string | null;
  ownerMembershipId?: string | null;
  dueDate: string | null;
  completedAt?: string | null;
};

type Milestone = {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  completedAt: string | null;
  position: number;
};

type Member = { id: string; name: string };

const STATUS_CLASS: Record<Task["status"], string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  blocked: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
};

const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-slate-400",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

export function WorkstreamsCard({
  engagementId,
  tasks,
  milestones,
  members,
  canEdit,
}: {
  engagementId: string;
  tasks: Task[];
  milestones: Milestone[];
  members: Member[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [addingTask, setAddingTask] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const completedMilestones = milestones.filter((m) => m.completedAt);
  const pendingMilestones = milestones.filter((m) => !m.completedAt);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              Workstreams
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Action items, owners, and deal milestones. Tasks track day-to-day work;
              milestones mark major deal events.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{done.length}/{tasks.length} tasks done</span>
            <span>·</span>
            <span>{completedMilestones.length}/{milestones.length} milestones</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Milestones ─────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Deal milestones
            </h3>
            {canEdit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingMilestone(true)}>
                <Plus className="mr-1 size-3" /> Add
              </Button>
            )}
          </div>

          {addingMilestone && (
            <AddMilestoneForm
              engagementId={engagementId}
              onDone={() => { setAddingMilestone(false); router.refresh(); }}
              onCancel={() => setAddingMilestone(false)}
            />
          )}

          {milestones.length === 0 && !addingMilestone && (
            <p className="text-xs text-muted-foreground">No milestones yet.</p>
          )}

          <div className="relative space-y-1 pl-4">
            {milestones.length > 0 && (
              <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
            )}
            {milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                engagementId={engagementId}
                canEdit={canEdit}
                onRefresh={() => router.refresh()}
              />
            ))}
          </div>
        </div>

        {/* ── Tasks ────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Action items
            </h3>
            {canEdit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingTask(true)}>
                <Plus className="mr-1 size-3" /> Add
              </Button>
            )}
          </div>

          {addingTask && (
            <AddTaskForm
              engagementId={engagementId}
              members={members}
              onDone={() => { setAddingTask(false); router.refresh(); }}
              onCancel={() => setAddingTask(false)}
            />
          )}

          {tasks.length === 0 && !addingTask && (
            <p className="text-xs text-muted-foreground">No action items yet.</p>
          )}

          {open.map((t) => (
            <TaskRow key={t.id} task={t} engagementId={engagementId} members={members} canEdit={canEdit} onRefresh={() => router.refresh()} />
          ))}

          {done.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {done.length} completed task{done.length > 1 ? "s" : ""}
              </summary>
              <div className="mt-1 space-y-1">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} engagementId={engagementId} members={members} canEdit={canEdit} onRefresh={() => router.refresh()} />
                ))}
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MilestoneRow({
  milestone,
  engagementId,
  canEdit,
  onRefresh,
}: {
  milestone: Milestone;
  engagementId: string;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [pending, start] = useTransition();
  const done = !!milestone.completedAt;

  const toggle = () => {
    start(async () => {
      const r = await completeMilestone({ milestoneId: milestone.id, engagementId, completed: !done });
      if (r?.serverError) toast.error(r.serverError);
      else onRefresh();
    });
  };

  const remove = () => {
    start(async () => {
      const r = await deleteMilestone({ milestoneId: milestone.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else onRefresh();
    });
  };

  return (
    <div className="flex items-center gap-3 py-1 text-sm">
      <button
        type="button"
        onClick={canEdit ? toggle : undefined}
        disabled={pending || !canEdit}
        className="relative z-10 shrink-0"
        title={done ? "Mark incomplete" : "Mark complete"}
      >
        {done ? (
          <CheckCircle2 className="size-4 text-emerald-600" />
        ) : (
          <Circle className="size-4 text-muted-foreground" />
        )}
      </button>
      <div className="flex-1">
        <span className={done ? "line-through text-muted-foreground" : "font-medium"}>
          {milestone.name}
        </span>
        {milestone.targetDate && (
          <span className="ml-2 text-[11px] text-muted-foreground">
            {done ? "✓ " : "→ "}
            {new Date(milestone.targetDate + "T00:00:00").toLocaleDateString()}
          </span>
        )}
      </div>
      {canEdit && (
        <button type="button" onClick={remove} disabled={pending} className="shrink-0 text-muted-foreground/50 hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function TaskRow({
  task,
  engagementId,
  members,
  canEdit,
  onRefresh,
}: {
  task: Task;
  engagementId: string;
  members: Member[];
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [pending, start] = useTransition();

  const setStatus = (status: Task["status"]) => {
    start(async () => {
      const r = await updateWorkstreamTask({ taskId: task.id, engagementId, status });
      if (r?.serverError) toast.error(r.serverError);
      else onRefresh();
    });
  };

  const remove = () => {
    start(async () => {
      const r = await deleteWorkstreamTask({ taskId: task.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else onRefresh();
    });
  };

  return (
    <div className={`flex items-start gap-2 rounded-md border bg-card p-2.5 text-sm ${task.status === "done" ? "opacity-60" : ""}`}>
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} title={`Priority: ${task.priority}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={task.status === "done" ? "line-through text-muted-foreground" : "font-medium"}>
            {task.title}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLASS[task.status]}`}>
            {task.status.replace("_", " ")}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {task.ownerName && <span>→ {task.ownerName}</span>}
          {task.dueDate && (
            <span className={new Date(task.dueDate) < new Date() && task.status !== "done" ? "text-destructive" : ""}>
              <CalendarDays className="mr-0.5 inline size-3" />
              {new Date(task.dueDate + "T00:00:00").toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <select
            value={task.status}
            onChange={(e) => setStatus(e.target.value as Task["status"])}
            disabled={pending}
            className="h-7 rounded border border-input bg-background px-1 text-[11px]"
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
          <button type="button" onClick={remove} disabled={pending} className="text-muted-foreground/50 hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function AddTaskForm({
  engagementId,
  members,
  onDone,
  onCancel,
}: {
  engagementId: string;
  members: Member[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const save = () => {
    if (!title.trim()) return;
    start(async () => {
      const r = await createWorkstreamTask({
        engagementId,
        title: title.trim(),
        priority,
        ownerMembershipId: ownerId || null,
        dueDate: dueDate || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Task added"); onDone(); }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/10 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Label className="text-xs">Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" autoFocus className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Owner</Label>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={pending || !title.trim()}>
          {pending ? "Adding…" : "Add task"}
        </Button>
      </div>
    </div>
  );
}

function AddMilestoneForm({
  engagementId,
  onDone,
  onCancel,
}: {
  engagementId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const save = () => {
    if (!name.trim()) return;
    start(async () => {
      const r = await createMilestone({ engagementId, name: name.trim(), targetDate: targetDate || null });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Milestone added"); onDone(); }
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/10 p-2.5">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Milestone name (e.g. LOI Signed)" autoFocus className="flex-1 h-8 text-sm" />
      <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-36 h-8 text-sm" />
      <Button size="sm" className="h-8" onClick={save} disabled={pending || !name.trim()}>Add</Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={onCancel} disabled={pending}>Cancel</Button>
    </div>
  );
}
