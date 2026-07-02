"use client";

/**
 * Stakeholder sign-off panel — rendered inside the expansion of any
 * task or milestone that supports approval workflow.
 *
 * Three visual states based on the row's data:
 *
 *   1. Not requiring sign-off — shows a checkbox to enable it.
 *
 *   2. Requires sign-off but not yet signed — shows an amber
 *      "Awaiting [stakeholder]'s sign-off" block with an inline form
 *      to record the approval (who, when, optional notes).
 *
 *   3. Signed off — shows a green "✓ Signed off by [stakeholder] · [date]"
 *      block with a "Clear sign-off" link in case the operator
 *      recorded it in error.
 *
 * USI staff record the sign-off ON BEHALF OF the stakeholder. The
 * client doesn't log in to approve in v1 — that's a v2 portal feature.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  clearMilestoneSignoff,
  clearTaskSignoff,
  recordMilestoneSignoff,
  recordTaskSignoff,
  updateMilestone,
  updateTask,
} from "@/server/actions/projects";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StakeholderLite } from "./project-milestones-card";

type Scope = "task" | "milestone";

export function SignoffPanel({
  scope,
  rowId,
  requiresSignoff,
  signedOffAt,
  signedOffByStakeholderId,
  signoffNotes,
  assignedStakeholderId,
  stakeholders,
  canEdit,
}: {
  scope: Scope;
  rowId: string;
  requiresSignoff: boolean;
  signedOffAt: string | null;
  signedOffByStakeholderId: string | null;
  signoffNotes: string | null;
  assignedStakeholderId: string | null;
  stakeholders: StakeholderLite[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState(false);
  const [draftWho, setDraftWho] = useState(
    signedOffByStakeholderId ?? assignedStakeholderId ?? "",
  );
  const [draftWhen, setDraftWhen] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [draftNotes, setDraftNotes] = useState("");

  const isSigned = Boolean(signedOffAt);
  const signedBy = stakeholders.find(
    (s) => s.id === signedOffByStakeholderId,
  );
  const assignedFallback = stakeholders.find(
    (s) => s.id === assignedStakeholderId,
  );
  const awaitingWhom = signedBy ?? assignedFallback;

  const onToggleRequires = (next: boolean) => {
    start(async () => {
      const r =
        scope === "task"
          ? await updateTask({ taskId: rowId, requiresSignoff: next })
          : await updateMilestone({
              milestoneId: rowId,
              requiresSignoff: next,
            });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onRecord = () => {
    start(async () => {
      const r =
        scope === "task"
          ? await recordTaskSignoff({
              taskId: rowId,
              signedOffByStakeholderId: draftWho || null,
              signedOffAt: draftWhen || null,
              signoffNotes: draftNotes || null,
            })
          : await recordMilestoneSignoff({
              milestoneId: rowId,
              signedOffByStakeholderId: draftWho || null,
              signedOffAt: draftWhen || null,
              signoffNotes: draftNotes || null,
            });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Sign-off recorded");
      setOpening(false);
      setDraftNotes("");
      router.refresh();
    });
  };

  const onClear = () => {
    if (
      !confirm(
        "Clear the sign-off? The audit trail (who, when, notes) will be removed.",
      )
    )
      return;
    start(async () => {
      const r =
        scope === "task"
          ? await clearTaskSignoff({ taskId: rowId })
          : await clearMilestoneSignoff({ milestoneId: rowId });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  // STATE 1: not requiring sign-off — just a toggle.
  if (!requiresSignoff && !isSigned) {
    if (!canEdit) return null;
    return (
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs">
        <CircleDashed className="size-3.5 text-muted-foreground" />
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            className="size-3 accent-primary"
            checked={false}
            onChange={() => onToggleRequires(true)}
            disabled={pending}
          />
          Require stakeholder sign-off before closure
        </label>
      </div>
    );
  }

  // STATE 3: already signed off — uses card background; emerald only
  // on the left accent rule + icon for color cue without low-contrast
  // tinted text.
  if (isSigned) {
    return (
      <div className="rounded-md border bg-card px-3 py-2 text-xs border-l-4 border-l-emerald-500">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-600" />
            <div className="text-foreground">
              <strong>Signed off</strong> by{" "}
              {signedBy ? signedBy.name : "—"}
              {signedOffAt && (
                <>
                  {" · "}
                  {new Date(signedOffAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </>
              )}
              {signoffNotes && (
                <p className="mt-1 whitespace-pre-wrap text-[11px] font-normal text-muted-foreground">
                  &ldquo;{signoffNotes}&rdquo;
                </p>
              )}
            </div>
          </div>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={pending}
              className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    );
  }

  // STATE 2: requires sign-off but not signed yet — left amber bar +
  // amber icon; body text stays in default foreground for readability.
  return (
    <div className="space-y-2 rounded-md border bg-card px-3 py-2 text-xs border-l-4 border-l-amber-500">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 text-amber-600" />
          <div className="text-foreground">
            <strong>Awaiting sign-off</strong>
            {awaitingWhom && (
              <>
                {" "}
                from <strong>{awaitingWhom.name}</strong>
                {awaitingWhom.roleLabel && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    ({awaitingWhom.roleLabel})
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setOpening((v) => !v)}
            disabled={pending}
            className="h-7 text-[10px]"
          >
            {opening ? "Cancel" : "Record sign-off"}
          </Button>
        )}
      </div>

      {opening && canEdit && (
        <div className="space-y-2 rounded border bg-background p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-[10px]">Signed off by</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={draftWho}
                onChange={(e) => setDraftWho(e.target.value)}
              >
                <option value="">— Pick a stakeholder —</option>
                {stakeholders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.roleLabel ? ` — ${s.roleLabel}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-[10px]">Date</Label>
              <DateField value={draftWhen} onChange={setDraftWhen} compact />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[10px]">
              Notes (optional)
            </Label>
            <Textarea
              rows={2}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="e.g. Approved via email on 6/10; full thread in SharePoint."
              className="text-xs"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={onRecord} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : null}
              Record sign-off
            </Button>
          </div>
        </div>
      )}

      {canEdit && (
        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            className="size-3 accent-amber-600"
            checked={true}
            onChange={() => onToggleRequires(false)}
            disabled={pending}
          />
          Sign-off required — uncheck to drop the requirement
        </label>
      )}
    </div>
  );
}
