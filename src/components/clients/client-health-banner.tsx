import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  HardDrive,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type HealthData = {
  /** Open observation count by severity. */
  observationsBySeverity: Partial<Record<"critical" | "high" | "medium" | "low" | "info", number>>;
  observationsTotal: number;
  /** Items dated in the next N days (combined across sources). */
  upcoming30: number;
  upcoming60: number;
  upcoming90: number;
  overdue: number;
  /** Hardware not seen in N days. */
  staleHardwareCount: number;
  /** Each entry is a thing missing in the runbook (e.g. "No backup strategy"). */
  missingDataFlags: string[];
};

export function ClientHealthBanner({
  data,
  clientId,
}: {
  data: HealthData;
  clientId: string;
}) {
  const { observationsTotal, observationsBySeverity, upcoming30, overdue, staleHardwareCount, missingDataFlags } = data;
  const hasOverdue = overdue > 0;
  const hasCriticalObs = (observationsBySeverity.critical ?? 0) > 0;
  const hasMissing = missingDataFlags.length > 0;
  const hasStaleHw = staleHardwareCount > 0;

  const allClear =
    !hasOverdue &&
    !hasCriticalObs &&
    !hasMissing &&
    !hasStaleHw &&
    observationsTotal === 0 &&
    upcoming30 === 0;

  // Pick a banner tone — destructive if there's anything truly broken,
  // amber if attention needed, default otherwise.
  const tone =
    hasOverdue || hasCriticalObs
      ? "border-destructive/40 bg-destructive/5"
      : upcoming30 > 0 || hasMissing || hasStaleHw
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-emerald-500/40 bg-emerald-500/5";

  if (allClear) {
    return (
      <Card className={tone}>
        <CardContent className="flex items-center gap-3 p-4">
          <CheckCircle2 className="size-5 text-emerald-700 dark:text-emerald-300" />
          <div>
            <div className="text-sm font-semibold">Healthy</div>
            <div className="text-xs text-muted-foreground">
              No open observations, nothing dated in the next 30 days, no
              stale hardware, no runbook gaps.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={tone}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-3 max-sm:flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-700 dark:text-amber-300" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              Attention summary
            </span>
          </div>
          <Link
            href={`/upcoming?client=${clientId}`}
            className="text-xs text-primary hover:underline"
          >
            See all upcoming →
          </Link>
        </div>

        <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
          {/* Observations */}
          <Stat
            icon={<Eye className="size-4" />}
            label="Open observations"
            value={observationsTotal}
            detail={
              hasCriticalObs
                ? `${observationsBySeverity.critical} critical`
                : observationsBySeverity.high
                  ? `${observationsBySeverity.high} high`
                  : null
            }
            tone={hasCriticalObs ? "destructive" : observationsBySeverity.high ? "amber" : "default"}
          />

          {/* Overdue */}
          <Stat
            icon={<CalendarClock className="size-4" />}
            label="Overdue"
            value={overdue}
            detail={null}
            tone={overdue > 0 ? "destructive" : "default"}
          />

          {/* Upcoming */}
          <Stat
            icon={<CalendarClock className="size-4" />}
            label="Due ≤ 30 days"
            value={upcoming30}
            detail={null}
            tone={upcoming30 > 0 ? "amber" : "default"}
          />

          {/* Stale HW */}
          <Stat
            icon={<HardDrive className="size-4" />}
            label="Hardware not seen 14+d"
            value={staleHardwareCount}
            detail={null}
            tone={staleHardwareCount > 0 ? "amber" : "default"}
          />
        </div>

        {missingDataFlags.length > 0 && (
          <div className="flex flex-wrap items-start gap-2 pt-1 text-xs">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <span className="font-semibold">Runbook gaps:</span>{" "}
              {missingDataFlags.map((f, i) => (
                <span key={f} className="text-muted-foreground">
                  {i > 0 && ", "}
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string | null;
  tone: "default" | "amber" | "destructive";
}) {
  const valueColor =
    tone === "destructive"
      ? "text-destructive"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "";
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</div>
        {detail && (
          <div className="text-[10px] text-muted-foreground">{detail}</div>
        )}
      </div>
    </div>
  );
}
