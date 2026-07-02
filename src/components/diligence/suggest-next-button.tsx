"use client";

import { useState, useTransition } from "react";
import { Lightbulb, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { suggestNextQuestions } from "@/server/actions/diligence-ai";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Suggestion = {
  questionKey: string;
  rationale: string;
  framingHint: string;
};

type QuestionMeta = {
  key: string;
  text: string;
  category: string;
};

export function SuggestNextButton({
  engagementId,
  questionMeta,
  onJumpToQuestion,
}: {
  engagementId: string;
  questionMeta: QuestionMeta[];
  /** Optional — when provided, suggestions become clickable and drill into the topic. */
  onJumpToQuestion?: (questionKey: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [pending, start] = useTransition();
  const metaByKey = new Map(questionMeta.map((q) => [q.key, q]));

  const run = () => {
    start(async () => {
      const r = await suggestNextQuestions({ engagementId, count: 5 });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (!data) {
        toast.error("No response from AI");
        return;
      }
      if (data.suggestions.length === 0) {
        toast.info(
          "No suggestions — every question is either answered or the AI couldn't prioritize. Try answering a few more first.",
        );
        return;
      }
      setSuggestions(data.suggestions);
    });
  };

  if (suggestions.length === 0) {
    return (
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        <Lightbulb className="mr-1 size-3.5" />
        {pending ? "Thinking…" : "Suggest next 5"}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-3.5 text-primary" />
          AI · top 5 questions to chase next
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSuggestions([])}>
          <X className="size-3.5" />
        </Button>
      </div>
      <ol className="space-y-2 text-sm">
        {suggestions.map((s, idx) => {
          const meta = metaByKey.get(s.questionKey);
          const inner = (
            <>
              <div className="flex flex-wrap items-start gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  #{idx + 1}
                </span>
                <span className="font-medium">{meta?.text ?? s.questionKey}</span>
                {meta && (
                  <Badge variant="outline" className="text-[10px]">
                    {meta.category}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <strong>Why:</strong> {s.rationale}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <strong>How to ask:</strong> {s.framingHint}
              </p>
            </>
          );
          if (onJumpToQuestion) {
            return (
              <li key={s.questionKey}>
                <button
                  type="button"
                  onClick={() => onJumpToQuestion(s.questionKey)}
                  className="block w-full rounded bg-card p-2.5 text-left transition-colors hover:bg-accent"
                  title="Open this topic and scroll to the question"
                >
                  {inner}
                </button>
              </li>
            );
          }
          return (
            <li key={s.questionKey} className="rounded bg-card p-2.5">
              {inner}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
