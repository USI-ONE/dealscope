import { Badge } from "@/components/ui/badge";

const STATUS_TONE: Record<string, string> = {
  planning: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  in_progress: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
};

const KIND_TONE: Record<string, string> = {
  loi_diligence: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  onboarding: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  hardware_audit: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  general_site: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function SurveyStatusPill({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${STATUS_TONE[status] ?? ""}`}
    >
      {label}
    </Badge>
  );
}

export function SurveyKindPill({
  kind,
  label,
}: {
  kind: string;
  label: string;
}) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${KIND_TONE[kind] ?? ""}`}
    >
      {label}
    </Badge>
  );
}
