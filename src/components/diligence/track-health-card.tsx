import Link from "next/link";
import { AlertTriangle, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_MA_QUESTIONS,
  getMaQuestionsForTrack,
  type MaTrack,
} from "@/lib/diligence/ma-question-library";
import { getQuestionsForIndustry } from "@/lib/diligence/question-library";
import type { Industry } from "@/lib/diligence/industries";

type ResponseRow = {
  questionKey: string;
  value: unknown;
  satisfactory: boolean | null;
  notes: string | null;
};

type TrackStats = {
  track: string;
  label: string;
  total: number;
  satisfactory: number;
  flagged: FlaggedItem[];
  tabId: string;
  reportTrack: string;
};

type FlaggedItem = {
  key: string;
  text: string;
  category: string;
  notes: string | null;
};

const MA_TRACKS: MaTrack[] = ["legal", "finance", "facilities", "hr"];

const TRACK_LABELS: Record<string, string> = {
  it: "IT",
  legal: "Legal",
  finance: "Finance",
  facilities: "Facilities",
  hr: "HR",
};

const TRACK_REPORT: Record<string, string> = {
  it: "it",
  legal: "legal",
  finance: "finance",
  facilities: "facilities",
  hr: "hr",
};

function scoreColor(pct: number) {
  if (pct >= 75) return "#458C5E";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

function TrackScoreBar({
  stats,
  engagementId,
}: {
  stats: TrackStats;
  engagementId: string;
}) {
  const pct = stats.total > 0 ? Math.round((stats.satisfactory / stats.total) * 100) : 0;
  const color = scoreColor(pct);

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0 text-sm font-medium">{stats.label}</div>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="text-xs tabular-nums font-semibold w-10 text-right" style={{ color }}>
        {pct}%
      </div>
      <div className="text-xs text-muted-foreground w-20 shrink-0">
        {stats.satisfactory}/{stats.total} ok
      </div>
      <Link
        href={`/diligence/${engagementId}/report/${stats.reportTrack}`}
        className="text-xs text-primary hover:underline shrink-0 flex items-center gap-0.5"
      >
        Infographic <ExternalLink className="size-2.5" />
      </Link>
    </div>
  );
}

export function TrackHealthCard({
  engagementId,
  responses,
  industry,
}: {
  engagementId: string;
  responses: ResponseRow[];
  industry: string | null;
}) {
  const itQuestions = getQuestionsForIndustry((industry as Industry) ?? null);

  // Build question text lookup
  const questionText = new Map<string, { text: string; category: string }>();
  for (const q of itQuestions) {
    questionText.set(q.key, { text: q.text, category: q.category });
  }
  for (const q of ALL_MA_QUESTIONS) {
    questionText.set(q.key, { text: q.text, category: q.category });
  }

  // Compute per-track stats
  const tracks: TrackStats[] = ["it", ...MA_TRACKS].map((track) => {
    const trackQuestions =
      track === "it"
        ? itQuestions
        : getMaQuestionsForTrack(track as MaTrack);

    const trackKeys = new Set(trackQuestions.map((q) => q.key));

    const trackResponses = responses.filter((r) => {
      if (track === "it") {
        return !r.questionKey.includes(".");
      }
      return r.questionKey.startsWith(`${track}.`);
    });

    const answered = trackResponses.filter(
      (r) => r.satisfactory !== null,
    );
    const satisfactoryCount = trackResponses.filter(
      (r) => r.satisfactory === true,
    ).length;

    const flagged: FlaggedItem[] = trackResponses
      .filter((r) => r.satisfactory === false)
      .map((r) => ({
        key: r.questionKey,
        text: questionText.get(r.questionKey)?.text ?? r.questionKey,
        category: questionText.get(r.questionKey)?.category ?? track.toUpperCase(),
        notes: r.notes,
      }))
      .slice(0, 30); // cap per track

    return {
      track,
      label: TRACK_LABELS[track] ?? track,
      total: trackResponses.length,
      satisfactory: satisfactoryCount,
      flagged,
      tabId: track,
      reportTrack: TRACK_REPORT[track] ?? track,
    };
  });

  const totalAnswered = responses.length;
  const totalSatisfactory = responses.filter((r) => r.satisfactory === true).length;
  const totalFlagged = responses.filter((r) => r.satisfactory === false).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="size-4 text-primary" />
          Diligence Health Dashboard
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Aggregated response quality across all 5 tracks.{" "}
          <span className="font-medium">{totalSatisfactory}</span> satisfactory,{" "}
          <span className="font-medium text-destructive">{totalFlagged}</span> flagged,{" "}
          <span className="font-medium">{totalAnswered}</span> total responses.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Score bars */}
        <div className="space-y-2.5">
          {tracks.map((s) => (
            <TrackScoreBar key={s.track} stats={s} engagementId={engagementId} />
          ))}
        </div>

        {/* Infographic quick links */}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <span className="text-xs text-muted-foreground">Infographic reports:</span>
          {tracks.map((s) => (
            <Link
              key={s.track}
              href={`/diligence/${engagementId}/report/${s.reportTrack}`}
              className="rounded-full border px-3 py-0.5 text-xs hover:bg-muted transition-colors"
            >
              {s.label}
            </Link>
          ))}
          <Link
            href={`/diligence/${engagementId}/report/ltc`}
            className="rounded-full border px-3 py-0.5 text-xs hover:bg-muted transition-colors"
          >
            Lead-to-Cash Flow
          </Link>
        </div>

        {/* Flagged items by track */}
        <div className="border-t pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Flagged Items — All Tracks
          </h3>
          <div className="space-y-4">
            {tracks
              .filter((s) => s.flagged.length > 0)
              .map((s) => (
                <div key={s.track}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                      {s.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.flagged.length} flagged
                    </span>
                    <Link
                      href={`/diligence/${engagementId}?tab=${s.tabId}`}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      Open tab →
                    </Link>
                  </div>
                  <div className="space-y-1.5 ml-2">
                    {s.flagged.map((item) => (
                      <div key={item.key} className="flex items-start gap-2">
                        <XCircle className="size-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-700 leading-snug">
                            {item.text}
                          </div>
                          {item.notes && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {item.notes}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {item.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
