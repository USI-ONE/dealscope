"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createObservation,
  deleteObservation,
  updateObservation,
} from "@/server/actions/client-runbook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind = "cleanup" | "validate" | "risk" | "follow_up" | "decision_pending" | "other";
type Severity = "info" | "low" | "medium" | "high" | "critical";
type Status = "open" | "in_progress" | "blocked" | "resolved" | "wont_fix";

type Member = { id: string; fullName: string | null; email: string };

export type ObservationRow = {
  id: string;
  title: string;
  description: string | null;
  kind: Kind;
  severity: Severity;
  status: Status;
  assignedToMembershipId: string | null;
  dueDate: string | null;
  resolvedAt: Date | string | null;
  notes: string | null;
};

const KIND_LABEL: Record<Kind, string> = {
  cleanup: "Cleanup",
  validate: "Validate",
  risk: "Risk",
  follow_up: "Follow up",
  decision_pending: "Decision pending",
  other: "Other",
};

const SEVERITY_VARIANT: Record<
  Severity,
  "default" | "secondary" | "outline" | "destructive"
> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
  info: "outline",
};

const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export function ClientObservationsCard({
  clientId,
  observations,
  members,
  canEdit,
}: {
  clientId: string;
  observations: ObservationRow[];
  members: Member[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const sorted = useMemo(() => {
    return [...observations].sort((a, b) => {
      const aResolved = a.status === "resolved" || a.status === "wont_fix";
      const bResolved = b.status === "resolved" || b.status === "wont_fix";
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      const sa = SEVERITY_ORDER.indexOf(a.severity);
      const sb = SEVERITY_ORDER.indexOf(b.severity);
      if (sa !== sb) return sa - sb;
      return a.title.localeCompare(b.title);
    });
  }, [observations]);

  const filtered = sorted.filter((o) => {
    if (showResolved) return true;
    return o.status !== "resolved" && o.status !== "wont_fix";
  });

  const openCount = observations.filter(
    (o) => o.status !== "resolved" && o.status !== "wont_fix",
  ).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <div>
          <CardTitle>Observations</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {openCount} open · {observations.length - openCount} closed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            Show closed
          </label>
          {canEdit && !adding && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 size-3.5" /> Add Observation
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <ObservationForm
            clientId={clientId}
            members={members}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {filtered.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            {observations.length === 0
              ? "No observations yet. Add cleanup items, things-to-validate, risks, and follow-ups so they don't get lost."
              : "No open items. Toggle 'Show closed' to see resolved entries."}
          </p>
        )}
        <ul className="divide-y">
          {filtered.map((o) =>
            editingId === o.id ? (
              <li key={o.id} className="py-2">
                <ObservationForm
                  clientId={clientId}
                  observation={o}
                  members={members}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ObservationRowView
                key={o.id}
                clientId={clientId}
                observation={o}
                members={members}
                canEdit={canEdit}
                onEdit={() => setEditingId(o.id)}
              />
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function ObservationRowView({
  clientId,
  observation,
  members,
  canEdit,
  onEdit,
}: {
  clientId: string;
  observation: ObservationRow;
  members: Member[];
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${observation.title}"?`)) return;
    start(async () => {
      const r = await deleteObservation({ observationId: observation.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Observation removed");
        router.refresh();
      }
    });
  };
  const assignee = members.find((m) => m.id === observation.assignedToMembershipId);
  const closed =
    observation.status === "resolved" || observation.status === "wont_fix";

  return (
    <li className={`flex items-start justify-between gap-3 py-2 ${closed ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={SEVERITY_VARIANT[observation.severity]}
            className="text-[10px] uppercase"
          >
            {observation.severity}
          </Badge>
          <Badge variant="outline" className="text-[10px] uppercase">
            {KIND_LABEL[observation.kind]}
          </Badge>
          <Badge
            variant={closed ? "outline" : "secondary"}
            className="text-[10px] uppercase"
          >
            {STATUS_LABEL[observation.status]}
          </Badge>
          <span className="font-medium">{observation.title}</span>
        </div>
        {observation.description && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {observation.description}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
          {assignee && (
            <span>
              Assigned: {assignee.fullName ?? assignee.email}
            </span>
          )}
          {observation.dueDate && <span>Due: {observation.dueDate}</span>}
          {observation.resolvedAt && (
            <span>
              Resolved:{" "}
              {new Date(observation.resolvedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={remove}
            disabled={pending}
            aria-label="Remove"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function ObservationForm({
  clientId,
  observation,
  members,
  onDone,
  onCancel,
}: {
  clientId: string;
  observation?: ObservationRow;
  members: Member[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(observation?.title ?? "");
  const [description, setDescription] = useState(observation?.description ?? "");
  const [kind, setKind] = useState<Kind>(observation?.kind ?? "validate");
  const [severity, setSeverity] = useState<Severity>(
    observation?.severity ?? "medium",
  );
  const [status, setStatus] = useState<Status>(observation?.status ?? "open");
  const [assignedTo, setAssignedTo] = useState(
    observation?.assignedToMembershipId ?? "",
  );
  const [dueDate, setDueDate] = useState(observation?.dueDate ?? "");
  const [notes, setNotes] = useState(observation?.notes ?? "");

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        title: title.trim(),
        description: description.trim() || null,
        kind,
        severity,
        status,
        assignedToMembershipId: assignedTo || null,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
      };
      const r = observation
        ? await updateObservation({ ...payload, observationId: observation.id })
        : await createObservation(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(observation ? "Observation updated" : "Observation added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-12">
        <div className="md:col-span-7">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Severity</Label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <div>
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Assigned to</Label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Unassigned —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName ?? m.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Due date</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : observation ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
