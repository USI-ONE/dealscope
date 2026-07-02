import { Badge } from "@/components/ui/badge";
import {
  USER_PROVISIONING_KIND_LABEL,
  USER_PROVISIONING_STATUS_LABEL,
} from "@/db/schema";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  submitted: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  in_progress: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  ready_for_handoff: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  handed_off: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
};

const KIND_TONE: Record<string, string> = {
  onboarding: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  offboarding: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  change: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function ProvisioningStatusPill({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${STATUS_TONE[status] ?? ""}`}
    >
      {USER_PROVISIONING_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function ProvisioningKindPill({ kind }: { kind: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${KIND_TONE[kind] ?? ""}`}
    >
      {USER_PROVISIONING_KIND_LABEL[kind] ?? kind}
    </Badge>
  );
}
