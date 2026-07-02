import { CheckCircle2, Circle, ClipboardCheck, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TRACK_LABEL: Record<string, string> = {
  legal: "Legal",
  finance: "Finance",
  facilities: "Facilities",
  hr: "HR",
};

export function MaTrackSummaryCard({
  track,
  totalQuestions,
  answeredCount,
  satisfactoryCount,
}: {
  track: string;
  totalQuestions: number;
  answeredCount: number;
  satisfactoryCount: number;
}) {
  const pendingCount = totalQuestions - answeredCount;
  const pct =
    totalQuestions > 0
      ? Math.round((answeredCount / totalQuestions) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{TRACK_LABEL[track] ?? track} track summary</CardTitle>
          <span className="text-xs text-muted-foreground">
            {pct}% of questions answered
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Answer questions in the questionnaire below — or paste notes and let
          AI extract answers — to populate this track. Mark answers satisfactory
          once confirmed so the AI briefing weights them higher.
          {answeredCount === 0
            ? " No answers recorded yet for this track."
            : ""}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Total questions"
            value={totalQuestions}
            icon={ListTodo}
            tone="slate"
          />
          <Tile
            label="Answered"
            value={answeredCount}
            icon={Circle}
            tone="emerald"
          />
          <Tile
            label="Satisfactory"
            value={satisfactoryCount}
            icon={CheckCircle2}
            tone="cyan"
          />
          <Tile
            label="Pending"
            value={pendingCount}
            icon={ClipboardCheck}
            tone="amber"
          />
        </div>
      </CardContent>
    </Card>
  );
}

const TONES: Record<string, { bg: string; text: string; ring: string }> = {
  slate: {
    bg: "bg-slate-500/10",
    text: "text-slate-700 dark:text-slate-300",
    ring: "ring-slate-500/20",
  },
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
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500/20",
  },
};

function Tile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "slate" | "emerald" | "cyan" | "amber";
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-lg border ring-1 ${t.ring} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${t.text}`}>
            {value}
          </p>
        </div>
        <div className={`rounded-md ${t.bg} p-1.5`}>
          <Icon className={`size-4 ${t.text}`} />
        </div>
      </div>
    </div>
  );
}
