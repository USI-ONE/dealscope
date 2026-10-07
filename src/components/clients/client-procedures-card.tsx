"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  History,
  Laptop,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  abandonProcedureRun,
  completeProcedureRun,
  createProcedure,
  deleteProcedure,
  seedDeviceProcedures,
  startProcedureRun,
  updateProcedure,
  updateRunStep,
} from "@/server/actions/procedures";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind =
  | "onboarding"
  | "offboarding"
  | "device_onboarding"
  | "device_offboarding"
  | "password_rotation"
  | "firmware_update"
  | "cert_renewal"
  | "dr_test"
  | "incident_response"
  | "audit"
  | "monthly_review"
  | "quarterly_review"
  | "annual_review"
  | "other";

const KIND_LABEL: Record<Kind, string> = {
  onboarding: "User onboarding",
  offboarding: "User offboarding",
  device_onboarding: "Device onboarding",
  device_offboarding: "Device offboarding",
  password_rotation: "Password rotation",
  firmware_update: "Firmware update",
  cert_renewal: "Cert renewal",
  dr_test: "DR test",
  incident_response: "Incident response",
  audit: "Audit",
  monthly_review: "Monthly review",
  quarterly_review: "Quarterly review",
  annual_review: "Annual review",
  other: "Other",
};

const KIND_ORDER: Kind[] = [
  "onboarding",
  "offboarding",
  "device_onboarding",
  "device_offboarding",
  "password_rotation",
  "firmware_update",
  "cert_renewal",
  "dr_test",
  "incident_response",
  "audit",
  "monthly_review",
  "quarterly_review",
  "annual_review",
  "other",
];

export type ProcedureStep = { id: string; text: string; hint?: string };

export type StepResult = {
  stepIndex: number;
  stepText: string;
  done: boolean;
  doneAt: string | null;
  notes: string | null;
};

export type RunRow = {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: Date | string;
  completedAt: Date | string | null;
  startedByName: string | null;
  stepResults: StepResult[];
  outcomeNotes: string | null;
  durationMinutes: number | null;
};

export type ProcedureRow = {
  id: string;
  title: string;
  kind: Kind;
  description: string | null;
  steps: ProcedureStep[];
  ownerMembershipId: string | null;
  ownerName: string | null;
  scheduleNotes: string | null;
  lastRunAt: Date | string | null;
  runs: RunRow[];
};

type Member = { id: string; fullName: string | null; email: string };

const fmtDate = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

const fmtDateTime = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export function ClientProceduresCard({
  clientId,
  procedures,
  members,
  canEdit,
}: {
  clientId: string;
  procedures: ProcedureRow[];
  members: Member[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [seeding, startSeeding] = useTransition();
  const hasDeviceProcedures = procedures.some(
    (p) =>
      p.kind === "device_onboarding" || p.kind === "device_offboarding",
  );
  const seedDevice = () => {
    startSeeding(async () => {
      const r = await seedDeviceProcedures({ clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        const data = r?.data;
        if (data && data.created > 0) {
          toast.success(
            `Seeded ${data.created} device procedure${data.created === 1 ? "" : "s"}${
              data.skipped > 0 ? ` (${data.skipped} already existed)` : ""
            }`,
          );
        } else {
          toast.info("Device procedures already exist — nothing to seed.");
        }
        router.refresh();
      }
    });
  };

  // Group by kind for predictable layout.
  const grouped = new Map<Kind, ProcedureRow[]>();
  for (const p of procedures) {
    const arr = grouped.get(p.kind) ?? [];
    arr.push(p);
    grouped.set(p.kind, arr);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
        <div>
          <CardTitle>Procedures (Runbooks)</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Documented step-by-step playbooks for routine work at this
            client. Click <strong>Run</strong> to step through one — every
            step gets a timestamp + room for notes, and the run history is
            kept indefinitely so you have a record of who did what when.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !hasDeviceProcedures && !adding && (
            <Button
              variant="outline"
              size="sm"
              onClick={seedDevice}
              disabled={seeding}
              title="Create starter device onboarding + offboarding checklists for this client."
            >
              <Laptop className="mr-1 size-3.5" />
              {seeding ? "Seeding…" : "Seed device procedures"}
            </Button>
          )}
          {canEdit && !adding && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 size-3.5" /> Add procedure
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <ProcedureForm
            clientId={clientId}
            members={members}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {procedures.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No procedures yet. Capture an onboarding checklist, a quarterly
            audit, an incident-response drill — anything you want to make
            repeatable.
          </p>
        )}
        {KIND_ORDER.filter((k) => grouped.has(k)).map((kind) => (
          <div key={kind} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[kind]}
            </h3>
            <div className="space-y-2">
              {(grouped.get(kind) ?? []).map((p) =>
                editingId === p.id ? (
                  <ProcedureForm
                    key={p.id}
                    clientId={clientId}
                    procedure={p}
                    members={members}
                    onDone={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <ProcedureCard
                    key={p.id}
                    clientId={clientId}
                    procedure={p}
                    canEdit={canEdit}
                    open={openId === p.id}
                    onToggle={() =>
                      setOpenId((cur) => (cur === p.id ? null : p.id))
                    }
                    onEdit={() => setEditingId(p.id)}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* --------------------------- Procedure card ------------------------------ */
function ProcedureCard({
  clientId,
  procedure,
  canEdit,
  open,
  onToggle,
  onEdit,
}: {
  clientId: string;
  procedure: ProcedureRow;
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (
      !confirm(
        `Delete "${procedure.title}"? This removes all run history. Cannot be undone.`,
      )
    )
      return;
    start(async () => {
      const r = await deleteProcedure({
        procedureId: procedure.id,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Procedure deleted");
        router.refresh();
      }
    });
  };

  const startRun = () => {
    start(async () => {
      const r = await startProcedureRun({ procedureId: procedure.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Run started — step through the checklist below.");
        router.refresh();
      }
    });
  };

  const inProgressRun = procedure.runs.find((r) => r.status === "in_progress");
  const lastCompleted = procedure.runs.find((r) => r.status === "completed");

  return (
    <div className="rounded-md border bg-muted/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/20"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {open ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium">{procedure.title}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {KIND_LABEL[procedure.kind]}
            </Badge>
            {inProgressRun && (
              <Badge variant="default" className="text-[10px] uppercase">
                Run in progress
              </Badge>
            )}
          </div>
          <div className="mt-1 ml-6 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{procedure.steps.length} steps</span>
            {procedure.ownerName && <span>Owner: {procedure.ownerName}</span>}
            {procedure.scheduleNotes && (
              <span>Cadence: {procedure.scheduleNotes}</span>
            )}
            <span>Last run: {fmtDate(procedure.lastRunAt)}</span>
            {procedure.runs.length > 0 && (
              <span>{procedure.runs.length} total runs</span>
            )}
          </div>
        </div>
        {canEdit && (
          <div
            className="flex shrink-0 items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {!inProgressRun && (
              <Button size="sm" onClick={startRun} disabled={pending}>
                <Play className="mr-1 size-3.5" /> Run
              </Button>
            )}
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
      </button>

      {open && (
        <div className="space-y-4 border-t px-3 py-3">
          {procedure.description && (
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {procedure.description}
            </p>
          )}

          {/* Active run — checklist */}
          {inProgressRun && (
            <ActiveRunPanel
              clientId={clientId}
              procedure={procedure}
              run={inProgressRun}
            />
          )}

          {/* Static step list when no active run */}
          {!inProgressRun && procedure.steps.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Steps
              </div>
              <ol className="space-y-1 text-sm">
                {procedure.steps.map((s, idx) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div>
                      <div>{s.text}</div>
                      {s.hint && (
                        <div className="text-[11px] text-muted-foreground">
                          {s.hint}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Run history */}
          {procedure.runs.length > 0 && (
            <div className="border-t pt-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <History className="size-3" /> Run history (
                {procedure.runs.length})
              </div>
              <ul className="space-y-2">
                {procedure.runs.slice(0, 8).map((r) => (
                  <li
                    key={r.id}
                    className="rounded border bg-card p-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          r.status === "completed"
                            ? "default"
                            : r.status === "in_progress"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-[10px] uppercase"
                      >
                        {r.status.replace("_", " ")}
                      </Badge>
                      <span>
                        Started {fmtDateTime(r.startedAt)}
                        {r.startedByName && ` by ${r.startedByName}`}
                      </span>
                      {r.completedAt && (
                        <span className="text-muted-foreground">
                          · {fmtDateTime(r.completedAt)}
                          {r.durationMinutes != null
                            ? ` (${r.durationMinutes} min)`
                            : ""}
                        </span>
                      )}
                    </div>
                    {r.outcomeNotes && (
                      <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                        {r.outcomeNotes}
                      </p>
                    )}
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {
                        r.stepResults.filter((s) => s.done).length
                      }{" "}
                      / {r.stepResults.length} steps completed
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Active run panel ---------------------------- */
function ActiveRunPanel({
  clientId,
  procedure,
  run,
}: {
  clientId: string;
  procedure: ProcedureRow;
  run: RunRow;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState("");

  const toggle = (stepIndex: number, done: boolean) => {
    start(async () => {
      const r = await updateRunStep({
        runId: run.id,
        stepIndex,
        done,
      });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const complete = () => {
    start(async () => {
      const r = await completeProcedureRun({
        runId: run.id,
        outcomeNotes: outcome.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Procedure run completed");
        router.refresh();
      }
    });
  };

  const abandon = () => {
    if (!confirm("Abandon this run? Step progress is preserved in history.")) return;
    start(async () => {
      const r = await abandonProcedureRun({
        runId: run.id,
        reason: outcome.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Run abandoned");
        router.refresh();
      }
    });
  };

  const completedCount = run.stepResults.filter((s) => s.done).length;
  const total = run.stepResults.length;

  return (
    <div className="space-y-3 rounded-md border-2 border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2 max-sm:flex-wrap">
        <div className="text-xs font-bold uppercase tracking-wider">
          Run in progress
          <span className="ml-2 font-normal normal-case text-muted-foreground">
            {completedCount} / {total} steps complete
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Started {fmtDateTime(run.startedAt)}
        </div>
      </div>
      <ol className="space-y-2">
        {run.stepResults.map((s) => (
          <li key={s.stepIndex} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={s.done}
              onChange={(e) => toggle(s.stepIndex, e.target.checked)}
              disabled={pending}
              className="mt-0.5 size-4"
            />
            <div className="flex-1">
              <div className={s.done ? "text-muted-foreground line-through" : ""}>
                {s.stepText}
              </div>
              {procedure.steps[s.stepIndex]?.hint && (
                <div className="text-[11px] text-muted-foreground">
                  {procedure.steps[s.stepIndex].hint}
                </div>
              )}
              {s.done && s.doneAt && (
                <div className="text-[10px] text-muted-foreground">
                  ✓ {fmtDateTime(s.doneAt)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Label className="text-xs">Outcome notes (optional)</Label>
        <Textarea
          rows={2}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="What happened, exceptions, follow-ups"
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={abandon}
          disabled={pending}
        >
          Abandon
        </Button>
        <Button size="sm" onClick={complete} disabled={pending}>
          <Check className="mr-1 size-3.5" />
          {pending ? "Saving…" : "Complete run"}
        </Button>
      </div>
      {/* Suppress unused-import warning for clientId prop drilling. */}
      <span hidden>{clientId}</span>
    </div>
  );
}

/* --------------------------- Procedure form ------------------------------ */
function ProcedureForm({
  clientId,
  procedure,
  members,
  onDone,
  onCancel,
}: {
  clientId: string;
  procedure?: ProcedureRow;
  members: Member[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(procedure?.title ?? "");
  const [kind, setKind] = useState<Kind>(procedure?.kind ?? "other");
  const [description, setDescription] = useState(procedure?.description ?? "");
  const [scheduleNotes, setScheduleNotes] = useState(
    procedure?.scheduleNotes ?? "",
  );
  const [ownerMembershipId, setOwnerMembershipId] = useState(
    procedure?.ownerMembershipId ?? "",
  );
  const [steps, setSteps] = useState<ProcedureStep[]>(
    procedure?.steps ?? [{ id: makeId(), text: "" }],
  );

  const addStep = () =>
    setSteps((s) => [...s, { id: makeId(), text: "" }]);
  const removeStep = (id: string) =>
    setSteps((s) => (s.length > 1 ? s.filter((x) => x.id !== id) : s));
  const moveStep = (id: string, dir: -1 | 1) =>
    setSteps((curr) => {
      const idx = curr.findIndex((s) => s.id === id);
      const next = [...curr];
      const target = idx + dir;
      if (target < 0 || target >= curr.length) return curr;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    const cleanSteps = steps
      .map((s) => ({ ...s, text: s.text.trim() }))
      .filter((s) => s.text.length > 0);
    if (cleanSteps.length === 0) {
      toast.error("Add at least one step");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        title: title.trim(),
        kind,
        description: description.trim() || null,
        steps: cleanSteps,
        ownerMembershipId: ownerMembershipId || null,
        scheduleNotes: scheduleNotes.trim() || null,
      };
      const r = procedure
        ? await updateProcedure({
            ...payload,
            procedureId: procedure.id,
          })
        : await createProcedure(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(procedure ? "Procedure saved" : "Procedure added");
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
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
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
          <Label>Schedule / cadence note</Label>
          <Input
            value={scheduleNotes}
            onChange={(e) => setScheduleNotes(e.target.value)}
            placeholder="every quarter / first Monday of month / on demand"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why and when this procedure runs, prerequisites, expected outcome"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Steps</Label>
        {steps.map((s, idx) => (
          <div key={s.id} className="flex items-start gap-2 rounded border bg-card p-2">
            <span className="mt-2 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums text-muted-foreground">
              {idx + 1}
            </span>
            <div className="flex-1 space-y-1.5">
              <Input
                value={s.text}
                onChange={(e) =>
                  setSteps((curr) =>
                    curr.map((x) =>
                      x.id === s.id ? { ...x, text: e.target.value } : x,
                    ),
                  )
                }
                placeholder="What to do"
              />
              <Input
                value={s.hint ?? ""}
                onChange={(e) =>
                  setSteps((curr) =>
                    curr.map((x) =>
                      x.id === s.id
                        ? { ...x, hint: e.target.value || undefined }
                        : x,
                    ),
                  )
                }
                placeholder="Hint / detail (optional)"
                className="text-[11px]"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => moveStep(s.id, -1)}
                disabled={idx === 0}
                className="size-6"
                aria-label="Move up"
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => moveStep(s.id, 1)}
                disabled={idx === steps.length - 1}
                className="size-6"
                aria-label="Move down"
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeStep(s.id)}
                className="size-6 text-muted-foreground hover:text-destructive"
                aria-label="Remove step"
                disabled={steps.length === 1}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addStep}>
          <Plus className="mr-1 size-3.5" /> Add step
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : procedure ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}
