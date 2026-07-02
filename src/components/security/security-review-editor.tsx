"use client";

/**
 * Security review editor — operator-facing form for the 14-question
 * checklist + general notes. Pre-filled with the live-derived posture
 * suggestions; operator confirms / overrides each row, then "Save as
 * new review" appends a snapshot.
 *
 * Lives at /clients/[id]/security. Posture data + initial suggestions
 * are passed in from the server page.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleHelp, MinusCircle, Save, Sparkles, XCircle } from "lucide-react";
import { createSecurityReview } from "@/server/actions/security-reviews";
import {
  SECURITY_QUESTIONS,
  SECURITY_SECTIONS,
  STATUS_META,
  type AnswersMap,
  type SecurityAnswer,
  type SecurityAnswerStatus,
  type SecurityQuestion,
  type SecuritySection,
} from "@/lib/security-review/checklist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SecurityReviewEditorProps = {
  clientId: string;
  clientName: string;
  /** Suggested answers derived from live system data. */
  suggested: AnswersMap;
  /** Last-saved answers (if a review exists) — these win over
   *  suggestions on initial render so the operator sees their last
   *  attested values. */
  lastSavedAnswers?: AnswersMap | null;
  lastSavedNotes?: string | null;
  lastReviewDate?: string | null;
  /** Live counts at this moment — written into the snapshot when the
   *  operator saves. */
  totalSeats: number;
  totalDevices: number;
};

function todayIso(): string {
  // Render server-time defaults so the initial value matches across
  // hydration. The component is client-side so this runs in the
  // browser, but new Date is fine here because the value lives in
  // form state, not in cached SSR output.
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function quarterFromNow(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export function SecurityReviewEditor(props: SecurityReviewEditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reviewDate, setReviewDate] = useState(todayIso());
  const [nextDate, setNextDate] = useState(quarterFromNow());
  const [generalNotes, setGeneralNotes] = useState(
    props.lastSavedNotes ?? "",
  );

  // Initial answer map: last saved wins; fall back to suggested for
  // questions the previous review didn't cover (e.g. new questions
  // we've added since).
  const initial = useMemo<AnswersMap>(() => {
    const out: AnswersMap = {};
    for (const q of SECURITY_QUESTIONS) {
      const fromSaved = props.lastSavedAnswers?.[q.id];
      const fromSuggested = props.suggested[q.id];
      out[q.id] = fromSaved ?? fromSuggested ?? {
        status: "na",
        detail: "",
        autoFilled: false,
      };
    }
    return out;
  }, [props.lastSavedAnswers, props.suggested]);

  const [answers, setAnswers] = useState<AnswersMap>(initial);

  const setAnswer = (qid: string, patch: Partial<SecurityAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: {
        // Editing flips autoFilled OFF — this answer is now operator-
        // attested. Status changes pull through, detail edits pull
        // through, etc.
        ...prev[qid],
        ...patch,
        autoFilled: false,
      },
    }));
  };

  const applySuggestion = (qid: string) => {
    const s = props.suggested[qid];
    if (!s) return;
    setAnswers((prev) => ({
      ...prev,
      [qid]: { ...s, autoFilled: true },
    }));
  };

  const save = () => {
    start(async () => {
      const r = await createSecurityReview({
        clientId: props.clientId,
        reviewDate,
        nextReviewDate: nextDate || null,
        totalSeats: props.totalSeats,
        totalDevices: props.totalDevices,
        answers,
        generalNotes: generalNotes || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      if (r?.validationErrors) {
        toast.error("Validation failed — check the form");
        return;
      }
      toast.success(`Security review saved for ${props.clientName}`);
      router.refresh();
    });
  };

  // Bucket questions by section for the rendering loop.
  const bySection = useMemo(() => {
    const out: Record<string, SecurityQuestion[]> = {};
    for (const q of SECURITY_QUESTIONS) {
      const sid = q.section.id;
      out[sid] = out[sid] ? [...out[sid], q] : [q];
    }
    return out;
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review metadata</CardTitle>
          <CardDescription>
            Stamped onto the snapshot. Defaults: today + 90 days for
            next review.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="reviewDate" className="text-xs">
              Review date
            </Label>
            <Input
              id="reviewDate"
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="nextDate" className="text-xs">
              Next review
            </Label>
            <Input
              id="nextDate"
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Total seats / users</Label>
            <div className="mt-1 h-9 rounded-md border bg-muted/30 px-3 py-2 text-xs tabular-nums">
              {props.totalSeats}
            </div>
          </div>
          <div>
            <Label className="text-xs">Total devices</Label>
            <div className="mt-1 h-9 rounded-md border bg-muted/30 px-3 py-2 text-xs tabular-nums">
              {props.totalDevices}
            </div>
          </div>
        </CardContent>
      </Card>

      {Object.values(SECURITY_SECTIONS).map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          questions={bySection[section.id] ?? []}
          answers={answers}
          suggested={props.suggested}
          onChange={setAnswer}
          onApplySuggestion={applySuggestion}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General notes</CardTitle>
          <CardDescription>
            Free text — recommendations, follow-ups, escalations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            placeholder="Add any cross-cutting observations or commitments…"
            className="min-h-[100px] text-sm"
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {props.lastReviewDate && (
          <span className="text-xs text-muted-foreground">
            Last review: {props.lastReviewDate}
          </span>
        )}
        <Button onClick={save} disabled={pending}>
          <Save className="mr-2 size-4" />
          {pending ? "Saving…" : "Save as new review"}
        </Button>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  questions,
  answers,
  suggested,
  onChange,
  onApplySuggestion,
}: {
  section: SecuritySection;
  questions: SecurityQuestion[];
  answers: AnswersMap;
  suggested: AnswersMap;
  onChange: (qid: string, patch: Partial<SecurityAnswer>) => void;
  onApplySuggestion: (qid: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((q) => (
          <QuestionRow
            key={q.id}
            q={q}
            answer={answers[q.id]}
            suggested={suggested[q.id]}
            onChange={(patch) => onChange(q.id, patch)}
            onApplySuggestion={() => onApplySuggestion(q.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function QuestionRow({
  q,
  answer,
  suggested,
  onChange,
  onApplySuggestion,
}: {
  q: SecurityQuestion;
  answer: SecurityAnswer;
  suggested: SecurityAnswer | undefined;
  onChange: (patch: Partial<SecurityAnswer>) => void;
  onApplySuggestion: () => void;
}) {
  const hasMeaningfulSuggestion =
    suggested &&
    suggested.autoFilled &&
    (suggested.status !== answer.status || suggested.detail !== answer.detail);

  return (
    <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-[1fr,140px,1.5fr,auto]">
      <div>
        <div className="text-sm font-medium leading-tight">{q.question}</div>
        <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          {q.metric}
        </div>
      </div>
      <div>
        <StatusPicker
          value={answer.status}
          onChange={(status) => onChange({ status })}
        />
      </div>
      <div>
        <Input
          value={answer.detail}
          onChange={(e) => onChange({ detail: e.target.value })}
          placeholder={q.detailHint}
          className="h-9 text-xs"
        />
      </div>
      <div className="flex items-center gap-2 self-center text-[10px]">
        {answer.autoFilled && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-50/40 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            title="Pre-filled from live system data — confirm or edit"
          >
            <Sparkles className="size-3" />
            auto
          </span>
        )}
        {hasMeaningfulSuggestion && !answer.autoFilled && (
          <button
            type="button"
            onClick={onApplySuggestion}
            className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-50/40 px-1.5 py-0.5 text-blue-700 hover:bg-blue-100/60 dark:bg-blue-950/30 dark:text-blue-300"
            title={`Live data suggests: ${STATUS_META[suggested!.status].label} — ${suggested!.detail}`}
          >
            apply suggestion
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPicker({
  value,
  onChange,
}: {
  value: SecurityAnswerStatus;
  onChange: (s: SecurityAnswerStatus) => void;
}) {
  const options: Array<{
    v: SecurityAnswerStatus;
    Icon: typeof CheckCircle2;
    cls: string;
  }> = [
    {
      v: "yes",
      Icon: CheckCircle2,
      cls:
        "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    },
    {
      v: "partial",
      Icon: CircleHelp,
      cls:
        "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    },
    {
      v: "no",
      Icon: XCircle,
      cls:
        "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    },
    {
      v: "na",
      Icon: MinusCircle,
      cls:
        "border-slate-400/40 bg-slate-50 text-slate-600 dark:bg-slate-950/30 dark:text-slate-400",
    },
  ];
  return (
    <div className="flex gap-1">
      {options.map(({ v, Icon, cls }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex h-9 flex-1 items-center justify-center rounded-md border text-xs uppercase tracking-wider transition ${value === v ? cls : "border-input bg-background text-muted-foreground hover:bg-muted"}`}
          title={STATUS_META[v].aria}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
