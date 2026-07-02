/**
 * Tiny presentational helpers shared across the change-control UI.
 */
import { Badge } from "@/components/ui/badge";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  submitted: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  in_review: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  scheduled: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  in_progress: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  implemented: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  reviewed: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300",
  rolled_back: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  cancelled: "bg-muted text-muted-foreground",
};

const RISK_TONE: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  standard: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  high: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  emergency: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  in_progress: "In progress",
  implemented: "Implemented",
  reviewed: "Reviewed (closed)",
  rolled_back: "Rolled back",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${STATUS_TONE[status] ?? ""}`}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${RISK_TONE[risk] ?? ""}`}
    >
      {risk}
    </Badge>
  );
}
