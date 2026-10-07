"use client";

/**
 * Per-client AI assistant card.
 *
 * Asks natural-language questions about THIS client only. The /api/
 * clients/[id]/ask endpoint streams tokens; we render them in real time
 * + render the final answer as Markdown.
 *
 * Conversation state is kept in component memory (lost on page refresh
 * — intentional for now so the AI never has stale answers leaking
 * across sessions about long-changed data). Persistent history can be
 * added later if the user wants.
 */
import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Turn = {
  role: "user" | "assistant";
  content: string;
};

const SAMPLE_QUESTIONS = [
  "Who is the internet provider at each location?",
  "How many active servers do they have?",
  "What is the oldest OS in the environment?",
  "Which devices are not Entra-joined?",
  "What licenses are renewing in the next 60 days?",
  "Summarize the backup strategy.",
];

export function ClientAiAskCard({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = async (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    setError(null);
    setInput("");
    const nextTurns: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(nextTurns);
    setStreamed("");
    setPending(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch(`/api/clients/${clientId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          // Send only the prior turns (don't include the current question
          // — that's `message` above).
          history: turns,
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }
      if (!r.body) throw new Error("No response body");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setStreamed(acc);
      }
      setTurns((t) => [...t, { role: "assistant", content: acc }]);
      setStreamed("");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        // User cancelled — fine.
      } else {
        setError((e as Error).message);
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setTurns([]);
    setStreamed("");
    setError(null);
    setInput("");
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/[.03] to-transparent">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              Ask about {clientName}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Natural-language questions answered from this client&apos;s
              TechOS record. Scoped strictly to <strong>{clientName}</strong> —
              never bleeds to other clients.
            </p>
          </div>
        </button>
        {turns.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={pending}
            title="Clear the conversation"
          >
            <Trash2 className="mr-1 size-3.5" /> Clear
          </Button>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          {/* Conversation */}
          {(turns.length > 0 || streamed) && (
            <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border bg-background p-3">
              {turns.map((t, i) => (
                <div key={i} className="space-y-1">
                  {t.role === "user" ? (
                    <>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        You
                      </Badge>
                      <p className="text-sm">{t.content}</p>
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        TechOS AI
                      </Badge>
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSanitize]}
                        >
                          {t.content}
                        </ReactMarkdown>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {streamed && (
                <div className="space-y-1">
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    TechOS AI
                  </Badge>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                    {streamed}
                    <span className="inline-block size-2 animate-pulse rounded-full bg-primary align-middle" />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Sample-question chips — only show before the first turn */}
          {turns.length === 0 && !streamed && (
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  disabled={pending}
                  className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-start gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${clientName}…`}
              rows={2}
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !input.trim()}
              className="self-stretch"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground">
            Tip: shift+enter for a new line. Answers come from this
            client&apos;s TechOS record only — never another client&apos;s
            data and never the open internet.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
