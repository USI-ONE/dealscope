"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createClientEvent,
  deleteClientEvent,
  updateClientEvent,
} from "@/server/actions/runbook-extras";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind =
  | "change"
  | "incident"
  | "maintenance"
  | "discovery"
  | "risk_resolution"
  | "outage"
  | "deployment"
  | "other";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const KIND_LABEL: Record<Kind, string> = {
  change: "Change",
  incident: "Incident",
  maintenance: "Maintenance",
  discovery: "Discovery",
  risk_resolution: "Risk resolution",
  outage: "Outage",
  deployment: "Deployment",
  other: "Other",
};

const KIND_TONE: Record<Kind, string> = {
  change: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  incident: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  maintenance: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  discovery: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  risk_resolution: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  outage: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  deployment: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  other: "bg-muted text-muted-foreground",
};

const SEVERITY_TONE: Record<Severity, string> = {
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  high: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  low: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  info: "bg-muted text-muted-foreground",
};

export type EventRow = {
  id: string;
  occurredAt: Date | string;
  kind: Kind;
  severity: Severity;
  title: string;
  narrative: string | null;
  rootCause: string | null;
  resolution: string | null;
  durationMinutes: number | null;
  affectedSystems: string[];
  recordedByName: string | null;
  resolvedAt: Date | string | null;
};

const fmtDate = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

export function ClientEventsCard({
  clientId,
  events,
  canEdit,
}: {
  clientId: string;
  events: EventRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Kind>("all");

  const filtered =
    filter === "all" ? events : events.filter((e) => e.kind === filter);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
        <div>
          <CardTitle>Change & incident log</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Append-only history of what happened at this client — changes,
            incidents, outages, deployments, discovered issues. Distinct
            from observations (which track open items).
          </p>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Log event
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Filter
            </span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="all">All ({events.length})</option>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
                const count = events.filter((e) => e.kind === k).length;
                if (count === 0) return null;
                return (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {adding && (
          <EventForm
            clientId={clientId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {events.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No events logged yet.
          </p>
        )}
        {filtered.map((e) =>
          editingId === e.id ? (
            <EventForm
              key={e.id}
              clientId={clientId}
              event={e}
              onDone={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <EventRowView
              key={e.id}
              clientId={clientId}
              event={e}
              canEdit={canEdit}
              onEdit={() => setEditingId(e.id)}
            />
          ),
        )}
      </CardContent>
    </Card>
  );
}

function EventRowView({
  clientId,
  event,
  canEdit,
  onEdit,
}: {
  clientId: string;
  event: EventRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Delete "${event.title}"?`)) return;
    start(async () => {
      const r = await deleteClientEvent({ eventId: event.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Event deleted");
        router.refresh();
      }
    });
  };
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{event.title}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${KIND_TONE[event.kind]}`}
            >
              {KIND_LABEL[event.kind]}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${SEVERITY_TONE[event.severity]}`}
            >
              {event.severity}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>Occurred {fmtDate(event.occurredAt)}</span>
            {event.durationMinutes != null && (
              <span>Duration: {event.durationMinutes} min</span>
            )}
            {event.resolvedAt && (
              <span>Resolved {fmtDate(event.resolvedAt)}</span>
            )}
            {event.recordedByName && <span>Logged by {event.recordedByName}</span>}
          </div>
          {event.affectedSystems.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {event.affectedSystems.map((s) => (
                <span
                  key={s}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {event.narrative && (
            <p className="mt-2 whitespace-pre-wrap text-xs">{event.narrative}</p>
          )}
          {(event.rootCause || event.resolution) && (
            <div className="mt-2 grid gap-2 rounded bg-muted/30 p-2 text-xs sm:grid-cols-2">
              {event.rootCause && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Root cause
                  </div>
                  <div>{event.rootCause}</div>
                </div>
              )}
              {event.resolution && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Resolution
                  </div>
                  <div>{event.resolution}</div>
                </div>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
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

function EventForm({
  clientId,
  event,
  onDone,
  onCancel,
}: {
  clientId: string;
  event?: EventRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [occurredAt, setOccurredAt] = useState(
    event
      ? new Date(event.occurredAt).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
  );
  const [kind, setKind] = useState<Kind>(event?.kind ?? "change");
  const [severity, setSeverity] = useState<Severity>(event?.severity ?? "info");
  const [title, setTitle] = useState(event?.title ?? "");
  const [narrative, setNarrative] = useState(event?.narrative ?? "");
  const [rootCause, setRootCause] = useState(event?.rootCause ?? "");
  const [resolution, setResolution] = useState(event?.resolution ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    event?.durationMinutes != null ? String(event.durationMinutes) : "",
  );
  const [affectedSystems, setAffectedSystems] = useState(
    (event?.affectedSystems ?? []).join(", "),
  );
  const [resolvedAt, setResolvedAt] = useState(
    event?.resolvedAt
      ? new Date(event.resolvedAt).toISOString().slice(0, 16)
      : "",
  );

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        occurredAt,
        kind,
        severity,
        title: title.trim(),
        narrative: narrative.trim() || null,
        rootCause: rootCause.trim() || null,
        resolution: resolution.trim() || null,
        durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
        affectedSystems: affectedSystems
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        resolvedAt: resolvedAt || null,
      };
      const r = event
        ? await updateClientEvent({ ...payload, eventId: event.id })
        : await createClientEvent(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(event ? "Event saved" : "Event logged");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Replaced firewall at HQ — Fortigate 100F → 200F"
          />
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
          <Label>Severity</Label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div>
          <Label>Occurred at</Label>
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <Label>Affected systems (comma separated)</Label>
          <Input
            value={affectedSystems}
            onChange={(e) => setAffectedSystems(e.target.value)}
            placeholder="firewall, vlan-corp, internet circuit"
          />
        </div>
        <div className="md:col-span-3">
          <Label>Narrative</Label>
          <Textarea
            rows={3}
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="What happened. Who noticed. Timeline."
          />
        </div>
        <div className="md:col-span-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Root cause</Label>
            <Textarea
              rows={2}
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
            />
          </div>
          <div>
            <Label>Resolution</Label>
            <Textarea
              rows={2}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Duration (minutes)</Label>
          <Input
            type="number"
            min="0"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
        </div>
        <div>
          <Label>Resolved at</Label>
          <Input
            type="datetime-local"
            value={resolvedAt}
            onChange={(e) => setResolvedAt(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : event ? "Save" : "Log event"}
        </Button>
      </div>
    </div>
  );
}
