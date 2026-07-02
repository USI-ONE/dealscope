"use client";

/**
 * Status-transition button bar — lights up the next allowed actions
 * based on the CR's current status. Mirrors the ALLOWED map on the
 * server so the UI doesn't show buttons that would just fail.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { transitionStatus } from "@/server/actions/change-control";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Status =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "scheduled"
  | "in_progress"
  | "implemented"
  | "reviewed"
  | "rolled_back"
  | "cancelled";

const ALLOWED: Record<Status, Status[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_review", "cancelled"],
  in_review: ["approved", "rejected", "cancelled"],
  approved: ["scheduled", "in_progress", "cancelled"],
  rejected: ["draft", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["implemented", "rolled_back", "cancelled"],
  implemented: ["reviewed", "rolled_back"],
  reviewed: [],
  rolled_back: ["reviewed"],
  cancelled: [],
};

const ICON: Record<Status, React.ReactNode> = {
  draft: <ArrowRight className="size-3.5" />,
  submitted: <Send className="size-3.5" />,
  in_review: <Clock className="size-3.5" />,
  approved: <CheckCircle2 className="size-3.5" />,
  rejected: <XCircle className="size-3.5" />,
  scheduled: <Clock className="size-3.5" />,
  in_progress: <Play className="size-3.5" />,
  implemented: <CheckCircle2 className="size-3.5" />,
  reviewed: <CheckCircle2 className="size-3.5" />,
  rolled_back: <RotateCcw className="size-3.5" />,
  cancelled: <Ban className="size-3.5" />,
};

const LABEL: Record<Status, string> = {
  draft: "Reopen as draft",
  submitted: "Submit for review",
  in_review: "Move to review",
  approved: "Mark approved",
  rejected: "Reject",
  scheduled: "Mark scheduled",
  in_progress: "Start implementation",
  implemented: "Mark implemented",
  reviewed: "Close (post-review)",
  rolled_back: "Mark rolled back",
  cancelled: "Cancel",
};

const VARIANT: Record<Status, "default" | "outline" | "destructive" | "secondary"> = {
  draft: "outline",
  submitted: "default",
  in_review: "outline",
  approved: "default",
  rejected: "destructive",
  scheduled: "outline",
  in_progress: "default",
  implemented: "default",
  reviewed: "default",
  rolled_back: "secondary",
  cancelled: "outline",
};

export function StatusActions({
  changeRequestId,
  status,
}: {
  changeRequestId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closeOpen, setCloseOpen] = useState(false);
  const [outcome, setOutcome] = useState<
    "successful" | "successful_with_issues" | "rolled_back" | "failed"
  >("successful");
  const [plannedVsActual, setPlannedVsActual] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [preventiveActions, setPreventiveActions] = useState("");
  const [docsUpdated, setDocsUpdated] = useState(false);

  const allowed = ALLOWED[status];

  const go = (
    to: Status,
    extras: Partial<Parameters<typeof transitionStatus>[0]> = {},
  ) => {
    start(async () => {
      const r = await transitionStatus({
        changeRequestId,
        to,
        ...extras,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Status updated");
      setCloseOpen(false);
      router.refresh();
    });
  };

  if (allowed.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No further transitions — this change request is closed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {allowed.map((to) => {
          // The "reviewed" close needs an outcome — open the panel rather
          // than firing immediately.
          if (to === "reviewed") {
            return (
              <Button
                key={to}
                variant={VARIANT[to]}
                onClick={() => setCloseOpen((v) => !v)}
                disabled={pending}
              >
                {ICON[to]}
                <span className="ml-1">{LABEL[to]}</span>
              </Button>
            );
          }
          return (
            <Button
              key={to}
              variant={VARIANT[to]}
              onClick={() => go(to)}
              disabled={pending}
            >
              {ICON[to]}
              <span className="ml-1">{LABEL[to]}</span>
            </Button>
          );
        })}
      </div>

      {closeOpen && (
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
          <div>
            <Label className="text-xs">Outcome</Label>
            <select
              value={outcome}
              onChange={(e) =>
                setOutcome(e.target.value as typeof outcome)
              }
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="successful">Successful</option>
              <option value="successful_with_issues">Successful with issues</option>
              <option value="rolled_back">Rolled back</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Planned vs actual</Label>
            <Textarea
              rows={2}
              value={plannedVsActual}
              onChange={(e) => setPlannedVsActual(e.target.value)}
              placeholder="What was planned vs what actually happened (timing, scope, side effects)."
            />
          </div>
          <div>
            <Label className="text-xs">Root cause (if issues / rollback / failure)</Label>
            <Textarea
              rows={2}
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              placeholder="What caused the deviation. Required for rolled-back / failed outcomes per policy §3 step 8."
            />
          </div>
          <div>
            <Label className="text-xs">Preventive actions / lessons learned</Label>
            <Textarea
              rows={2}
              value={preventiveActions}
              onChange={(e) => setPreventiveActions(e.target.value)}
              placeholder="What we'll do differently next time. Goes into the ledger entry as resolution."
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={docsUpdated}
              onChange={(e) => setDocsUpdated(e.target.checked)}
            />
            Documentation / runbook updated
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCloseOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                go("reviewed", {
                  postReviewOutcome: outcome,
                  pirPlannedVsActual: plannedVsActual,
                  pirRootCause: rootCause,
                  pirPreventiveActions: preventiveActions,
                  documentationUpdated: docsUpdated,
                })
              }
              disabled={pending}
            >
              {pending ? "Closing…" : "Close & write to ledger"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
