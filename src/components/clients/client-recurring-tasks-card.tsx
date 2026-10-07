"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  completeRecurringTask,
  createRecurringTask,
  deleteRecurringTask,
  updateRecurringTask,
} from "@/server/actions/runbook-extras";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind = "review" | "audit" | "renewal" | "maintenance" | "compliance" | "other";

const KIND_LABEL: Record<Kind, string> = {
  review: "Review",
  audit: "Audit",
  renewal: "Renewal",
  maintenance: "Maintenance",
  compliance: "Compliance",
  other: "Other",
};

const CADENCE_PRESETS: Array<{ days: number; label: string }> = [
  { days: 30, label: "Monthly (30d)" },
  { days: 90, label: "Quarterly (90d)" },
  { days: 180, label: "Semi-annual (180d)" },
  { days: 365, label: "Annual (365d)" },
];

export type RecurringTaskRow = {
  id: string;
  title: string;
  kind: Kind;
  cadenceDays: number;
  nextDueAt: Date | string;
  lastDoneAt: Date | string | null;
  ownerMembershipId: string | null;
  ownerName: string | null;
  procedureId: string | null;
  procedureTitle: string | null;
  notes: string | null;
};

type Member = { id: string; fullName: string | null; email: string };
type Procedure = { id: string; title: string };

const fmtDate = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

function daysFromToday(d: Date | string): number {
  const t = new Date();
  t.setUTCHours(0, 0, 0, 0);
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return Math.round((x.getTime() - t.getTime()) / 86_400_000);
}

export function ClientRecurringTasksCard({
  clientId,
  tasks,
  members,
  procedures,
  canEdit,
}: {
  clientId: string;
  tasks: RecurringTaskRow[];
  members: Member[];
  procedures: Procedure[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sort by next due date.
  const sorted = [...tasks].sort(
    (a, b) =>
      new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime(),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
        <div>
          <CardTitle>Recurring tasks</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Things that come due on a cadence. Marking one done auto-advances
            the next-due date by the cadence. Aggregated org-wide on the{" "}
            <strong>Upcoming</strong> page.
          </p>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add task
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <RecurringTaskForm
            clientId={clientId}
            members={members}
            procedures={procedures}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {tasks.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No recurring tasks for this client.
          </p>
        )}
        {sorted.map((t) =>
          editingId === t.id ? (
            <RecurringTaskForm
              key={t.id}
              clientId={clientId}
              task={t}
              members={members}
              procedures={procedures}
              onDone={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <RecurringTaskRowView
              key={t.id}
              clientId={clientId}
              task={t}
              canEdit={canEdit}
              onEdit={() => setEditingId(t.id)}
            />
          ),
        )}
      </CardContent>
    </Card>
  );
}

function RecurringTaskRowView({
  clientId,
  task,
  canEdit,
  onEdit,
}: {
  clientId: string;
  task: RecurringTaskRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const days = daysFromToday(task.nextDueAt);

  const complete = () => {
    start(async () => {
      const r = await completeRecurringTask({ taskId: task.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Marked done — next due date advanced");
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    start(async () => {
      const r = await deleteRecurringTask({ taskId: task.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Task deleted");
        router.refresh();
      }
    });
  };

  return (
    <div
      className={`rounded-md border bg-muted/10 p-3 ${
        days < 0 ? "border-destructive/40" : days <= 14 ? "border-amber-500/40" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{task.title}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {KIND_LABEL[task.kind]}
            </Badge>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              every {task.cadenceDays}d
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span
              className={
                days < 0
                  ? "font-semibold text-destructive"
                  : days <= 14
                    ? "font-semibold text-amber-700 dark:text-amber-300"
                    : ""
              }
            >
              Due {fmtDate(task.nextDueAt)}
              {days < 0
                ? ` (${Math.abs(days)}d overdue)`
                : days === 0
                  ? " (today)"
                  : ` (in ${days}d)`}
            </span>
            {task.lastDoneAt && <span>Last done: {fmtDate(task.lastDoneAt)}</span>}
            {task.ownerName && <span>Owner: {task.ownerName}</span>}
            {task.procedureTitle && (
              <span>↳ Runs procedure: {task.procedureTitle}</span>
            )}
          </div>
          {task.notes && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {task.notes}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" onClick={complete} disabled={pending}>
              <Check className="mr-1 size-3.5" /> Done
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={pending}
              aria-label="Delete"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecurringTaskForm({
  clientId,
  task,
  members,
  procedures,
  onDone,
  onCancel,
}: {
  clientId: string;
  task?: RecurringTaskRow;
  members: Member[];
  procedures: Procedure[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(task?.title ?? "");
  const [kind, setKind] = useState<Kind>(task?.kind ?? "other");
  const [cadenceDays, setCadenceDays] = useState(
    task?.cadenceDays?.toString() ?? "90",
  );
  const [nextDueAt, setNextDueAt] = useState(
    task
      ? new Date(task.nextDueAt).toISOString().slice(0, 10)
      : new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
  );
  const [ownerMembershipId, setOwnerMembershipId] = useState(
    task?.ownerMembershipId ?? "",
  );
  const [procedureId, setProcedureId] = useState(task?.procedureId ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        title: title.trim(),
        kind,
        cadenceDays: parseInt(cadenceDays, 10) || 90,
        nextDueAt,
        ownerMembershipId: ownerMembershipId || null,
        procedureId: procedureId || null,
        notes: notes.trim() || null,
      };
      const r = task
        ? await updateRecurringTask({ ...payload, taskId: task.id })
        : await createRecurringTask(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(task ? "Task saved" : "Task added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Cadence</Label>
          <div className="flex gap-2">
            <select
              value={cadenceDays}
              onChange={(e) => setCadenceDays(e.target.value)}
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            >
              {CADENCE_PRESETS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            <Input
              type="number"
              min={1}
              max={3650}
              value={cadenceDays}
              onChange={(e) => setCadenceDays(e.target.value)}
              className="w-20"
            />
          </div>
        </div>
        <div>
          <Label>Next due</Label>
          <Input
            type="date"
            value={nextDueAt}
            onChange={(e) => setNextDueAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Owner</Label>
          <select
            value={ownerMembershipId}
            onChange={(e) => setOwnerMembershipId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Unassigned —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName ?? m.email}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>Linked procedure (optional)</Label>
          <select
            value={procedureId}
            onChange={(e) => setProcedureId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— None —</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Use this to point at the procedure that should run when the
            task comes due (e.g. "Quarterly firewall review" → the SOP).
          </p>
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : task ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
