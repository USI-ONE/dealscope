"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Floating live-coaching drawer. Streams replies token-by-token from
 * /api/diligence/chat. Holds chat history in memory only (cleared when the
 * user closes the engagement page) — diligence chats are short-lived
 * coaching sessions, not durable artifacts.
 */
export function DiligenceChatDrawer({ engagementId }: { engagementId: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new tokens.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  // Cancel in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const newHistory: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...newHistory, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/diligence/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engagementId,
          message: text,
          history: messages.slice(-20), // last 20 turns max
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        // Append chunk to the LAST assistant message in state.
        setMessages((curr) => {
          const next = curr.slice();
          if (next.length > 0 && next[next.length - 1].role === "assistant") {
            next[next.length - 1] = { role: "assistant", content: acc };
          }
          return next;
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // user cancelled — leave whatever was streamed
      } else {
        const msg = err instanceof Error ? err.message : "stream error";
        toast.error(`Chat failed: ${msg}`);
        setMessages((curr) => {
          const next = curr.slice();
          if (next.length > 0 && next[next.length - 1].role === "assistant") {
            // If the assistant bubble is empty, replace with the error.
            // Otherwise leave the partial response in place.
            if (next[next.length - 1].content === "") {
              next[next.length - 1] = {
                role: "assistant",
                content: `[error: ${msg}]`,
              };
            }
          }
          return next;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-50 flex size-14 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 sm:bottom-6 sm:right-6 sm:size-auto sm:px-4 sm:py-2.5"
        aria-label="Open AI assistant"
      >
        <Sparkles className="size-5 sm:size-4" />
        <span className="hidden sm:inline">AI assistant</span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-2xl"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <MessageCircle className="size-4 text-primary" />
            Live coaching
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Claude sees the engagement context + question catalog.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              disabled={streaming}
            >
              Clear
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            <p className="font-medium">Examples:</p>
            <ul className="ml-4 mt-1 list-disc space-y-1">
              <li>"What should I ask next about backups?"</li>
              <li>
                "They said they have N-able RMM but no patching cadence — how
                should I dig in?"
              </li>
              <li>"Summarize what we know about identity so far."</li>
              <li>
                "Paste of session transcript — what's the headline risk in
                this?"
              </li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-6 rounded-lg bg-primary/10 p-3 text-sm"
                : "mr-6 rounded-lg border bg-card p-3 text-sm"
            }
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {m.role === "user" ? "You" : "AI"}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">
              {m.content || (
                <span className="italic text-muted-foreground">…</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask Claude for live coaching…"
            rows={2}
            className="resize-none"
            disabled={streaming}
          />
          {streaming ? (
            <Button onClick={stop} variant="outline" size="sm">
              Stop
            </Button>
          ) : (
            <Button onClick={() => void send()} size="sm" disabled={!input.trim()}>
              <Send className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Enter to send, Shift+Enter for newline.
        </p>
      </div>
    </div>
  );
}
