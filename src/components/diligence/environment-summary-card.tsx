/**
 * Headline inventory roll-up for a diligence engagement.
 *
 * Four KPI tiles — Computers / Servers / Virtual machines / Network
 * stack — with breakdowns underneath. Counts come from BOTH the site
 * survey inventory AND the questionnaire's count-style questions
 * (which is where "AI extract from notes/files" answers land when
 * accepted). The breakdown tags each row with its source.
 */
import Link from "next/link";
import {
  ClipboardList,
  Cpu,
  Monitor,
  Network as NetworkIcon,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EnvironmentTotals } from "@/lib/diligence/environment-totals";

export function EnvironmentSummaryCard({
  engagementId,
  totals,
  surveyCount,
  responseCount,
}: {
  engagementId: string;
  totals: EnvironmentTotals;
  surveyCount: number;
  /** Number of questionnaire answers on this engagement — purely for
   *  the explanatory subtext. */
  responseCount: number;
}) {
  const hasAnyData =
    totals.computers.total > 0 ||
    totals.serversPhysical.total > 0 ||
    totals.virtualMachines.total > 0 ||
    totals.networkStack.total > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Environment summary</CardTitle>
          <span className="text-xs text-muted-foreground">
            From {responseCount} questionnaire answer
            {responseCount === 1 ? "" : "s"} + {surveyCount} site survey
            {surveyCount === 1 ? "" : "s"}{" · "}
            <Link
              href={`/surveys/new?engagementId=${engagementId}`}
              className="hover:underline"
            >
              + Survey
            </Link>
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Counts roll up from the questionnaire (numeric &ldquo;count&rdquo;
          questions, including AI-extracted answers) and from any site
          survey inventory items attached to this engagement.
          {!hasAnyData
            ? " Answer count questions in the Diligence questionnaire below — or schedule a site survey — to populate."
            : ""}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Computers"
            tile={totals.computers}
            icon={Monitor}
            tone="emerald"
          />
          <Tile
            label="Servers (physical)"
            tile={totals.serversPhysical}
            icon={Server}
            tone="cyan"
          />
          <Tile
            label="Virtual machines"
            tile={totals.virtualMachines}
            icon={Cpu}
            tone="violet"
          />
          <Tile
            label="Network stack"
            tile={totals.networkStack}
            icon={NetworkIcon}
            tone="amber"
          />
        </div>
      </CardContent>
    </Card>
  );
}

const TONES: Record<string, { bg: string; text: string; ring: string }> = {
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/20",
  },
  cyan: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-300",
    ring: "ring-cyan-500/20",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-300",
    ring: "ring-violet-500/20",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500/20",
  },
};

function Tile({
  label,
  tile,
  icon: Icon,
  tone,
}: {
  label: string;
  tile: EnvironmentTotals["computers"];
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "cyan" | "violet" | "amber";
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-lg border ${t.ring} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${t.text}`}>
            {tile.total}
          </p>
        </div>
        <div className={`rounded-md ${t.bg} p-1.5`}>
          <Icon className={`size-4 ${t.text}`} />
        </div>
      </div>
      {tile.breakdown.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t pt-2 text-xs">
          {tile.breakdown.map((row, i) => (
            <li
              key={`${row.label}-${i}`}
              className="flex items-center justify-between gap-2 text-muted-foreground"
            >
              <span className="truncate">{row.label}</span>
              <span className="flex items-center gap-1">
                <SourceTag source={row.source} />
                <span className="font-mono tabular-nums">{row.count}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceTag({ source }: { source: "survey" | "questionnaire" }) {
  return (
    <span
      title={
        source === "survey"
          ? "From site survey inventory"
          : "From questionnaire answer"
      }
      className="text-muted-foreground/70"
    >
      {source === "survey" ? (
        <ClipboardList className="size-3" />
      ) : (
        <span className="text-[10px] font-semibold uppercase">Q</span>
      )}
    </span>
  );
}
