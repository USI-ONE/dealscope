import { DISCOVERY_STATUS_LABEL } from "@/db/schema/discovery";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  planning: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  in_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  review: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  complete: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function DiscoveryStatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[status], className)}>
      {DISCOVERY_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ProgressRing({ pct, size = 44, stroke = 4 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * Math.min(100, pct)) / 100}
        className={pct >= 100 ? "stroke-emerald-500" : "stroke-primary"}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="rotate-90 fill-foreground text-[11px] font-semibold"
        style={{ transformOrigin: "center" }}
      >
        {pct}%
      </text>
    </svg>
  );
}
