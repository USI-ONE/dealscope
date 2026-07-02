"use client";

/**
 * Per-client gap-assessment grid for a chosen standard.
 *
 * Renders one row per leaf control with a status selector, optional
 * score, and free-form evidence. Domain rows are bold separators with
 * roll-up stats (compliant / partial / non / total) so you can see
 * where the gaps cluster at a glance.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  upsertAssessment,
  upsertEngagementAssessment,
} from "@/server/actions/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill, STATUS_LABEL } from "./status-pill";

export type AssessmentScope =
  | { kind: "client"; clientId: string }
  | { kind: "engagement"; engagementId: string };

type Status =
  | "compliant"
  | "partial"
  | "non_compliant"
  | "not_applicable"
  | "unknown";

const STATUS_OPTIONS: Status[] = [
  "compliant",
  "partial",
  "non_compliant",
  "not_applicable",
  "unknown",
];

export type ControlRow = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  guidance: string | null;
  position: number;
};

export type AssessmentRow = {
  controlId: string;
  status: Status;
  score: number | null;
  evidence: string | null;
  assessedAt: Date | null;
};

export function AssessmentGrid({
  scope,
  controls,
  initialAssessments,
}: {
  scope: AssessmentScope;
  controls: ControlRow[];
  initialAssessments: AssessmentRow[];
}) {
  const initialMap = useMemo(() => {
    const m = new Map<string, AssessmentRow>();
    for (const a of initialAssessments) m.set(a.controlId, a);
    return m;
  }, [initialAssessments]);

  // Local UI state — track unsaved edits per control.
  const [edits, setEdits] = useState<Map<string, AssessmentRow>>(
    () => new Map(initialMap),
  );

  const setRow = (controlId: string, patch: Partial<AssessmentRow>) => {
    setEdits((curr) => {
      const next = new Map(curr);
      const prev = next.get(controlId) ?? {
        controlId,
        status: "unknown" as Status,
        score: null,
        evidence: null,
        assessedAt: null,
      };
      next.set(controlId, { ...prev, ...patch });
      return next;
    });
  };

  // Group: domain → leaves
  const domains = controls.filter((c) => c.parentId === null);
  const childrenByDomain = new Map<string, ControlRow[]>();
  for (const c of controls) {
    if (c.parentId) {
      const arr = childrenByDomain.get(c.parentId) ?? [];
      arr.push(c);
      childrenByDomain.set(c.parentId, arr);
    }
  }

  // Roll-up calc
  const overall = useMemo(() => calcRollup(controls, edits), [controls, edits]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total" value={overall.total} />
          <Stat label="Compliant" value={overall.compliant} tone="emerald" />
          <Stat label="Partial" value={overall.partial} tone="amber" />
          <Stat label="Non-compliant" value={overall.non} tone="rose" />
          <Stat label="N/A or Unknown" value={overall.naOrUnknown} />
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${pct(overall.compliant, overall.total)}%` }}
            />
            <div
              className="h-full bg-amber-500"
              style={{ width: `${pct(overall.partial, overall.total)}%` }}
            />
            <div
              className="h-full bg-rose-500"
              style={{ width: `${pct(overall.non, overall.total)}%` }}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {pct(overall.compliant, overall.total)}% compliant ·{" "}
          {pct(overall.partial, overall.total)}% partial ·{" "}
          {pct(overall.non, overall.total)}% non-compliant
        </p>
      </div>

      {domains.map((d) => {
        const leaves = childrenByDomain.get(d.id) ?? [];
        const dom = calcRollup(leaves, edits);
        return (
          <div key={d.id} className="space-y-2 rounded-md border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
              <div>
                <span className="font-mono text-xs text-muted-foreground">
                  {d.code ?? "—"}
                </span>
                <span className="ml-2 font-semibold">{d.title}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {dom.compliant}/{dom.total} compliant
              </span>
            </div>
            <div className="divide-y">
              {leaves.map((c) => {
                const a = edits.get(c.id) ?? {
                  controlId: c.id,
                  status: "unknown" as Status,
                  score: null,
                  evidence: null,
                  assessedAt: null,
                };
                const initial = initialMap.get(c.id);
                const isDirty =
                  !initial ||
                  initial.status !== a.status ||
                  (initial.score ?? null) !== (a.score ?? null) ||
                  (initial.evidence ?? "") !== (a.evidence ?? "");
                return (
                  <ControlAssessmentRow
                    key={c.id}
                    scope={scope}
                    control={c}
                    state={a}
                    isDirty={isDirty}
                    onChange={(patch) => setRow(c.id, patch)}
                    onSavedAt={(when) =>
                      setRow(c.id, { assessedAt: when })
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ControlAssessmentRow({
  scope,
  control,
  state,
  isDirty,
  onChange,
  onSavedAt,
}: {
  scope: AssessmentScope;
  control: ControlRow;
  state: AssessmentRow;
  isDirty: boolean;
  onChange: (patch: Partial<AssessmentRow>) => void;
  onSavedAt: (when: Date) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showEvidence, setShowEvidence] = useState(false);

  const save = () => {
    start(async () => {
      const r =
        scope.kind === "client"
          ? await upsertAssessment({
              clientId: scope.clientId,
              controlId: control.id,
              status: state.status,
              score: state.score,
              evidence: state.evidence,
            })
          : await upsertEngagementAssessment({
              engagementId: scope.engagementId,
              controlId: control.id,
              status: state.status,
              score: state.score,
              evidence: state.evidence,
            });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const now = new Date();
      onSavedAt(now);
      toast.success("Saved");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            {control.code && (
              <span className="font-mono text-xs text-muted-foreground">
                {control.code}
              </span>
            )}
            <span className="text-sm font-medium">{control.title}</span>
            <StatusPill status={state.status} />
            {state.assessedAt && (
              <span className="text-[10px] text-muted-foreground">
                Last assessed {new Date(state.assessedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {control.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {control.description}
            </p>
          )}
          {control.guidance && (
            <p className="mt-1 rounded bg-muted/30 p-1.5 text-[11px] italic text-muted-foreground">
              What good looks like: {control.guidance}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={state.status}
          onChange={(e) =>
            onChange({ status: e.target.value as Status })
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={0}
          max={100}
          value={state.score ?? ""}
          onChange={(e) =>
            onChange({
              score: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="score"
          className="h-8 w-20 text-xs"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEvidence((v) => !v)}
        >
          {showEvidence ? "Hide" : state.evidence ? "Edit" : "Add"} evidence
        </Button>
        {isDirty && (
          <Button size="sm" onClick={save} disabled={pending}>
            <Save className="mr-1 size-3.5" />
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      {showEvidence && (
        <Textarea
          rows={3}
          value={state.evidence ?? ""}
          onChange={(e) => onChange({ evidence: e.target.value })}
          placeholder="Notes, links to procedures / CRs / vendor records, or paste-in evidence."
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "";
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function calcRollup(
  controls: ControlRow[],
  edits: Map<string, AssessmentRow>,
): { total: number; compliant: number; partial: number; non: number; naOrUnknown: number } {
  const leaves = controls.filter((c) => c.parentId !== null);
  let compliant = 0;
  let partial = 0;
  let non = 0;
  let naOrUnknown = 0;
  for (const l of leaves) {
    const a = edits.get(l.id);
    const s = a?.status ?? "unknown";
    if (s === "compliant") compliant++;
    else if (s === "partial") partial++;
    else if (s === "non_compliant") non++;
    else naOrUnknown++;
  }
  return {
    total: leaves.length,
    compliant,
    partial,
    non,
    naOrUnknown,
  };
}

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}
