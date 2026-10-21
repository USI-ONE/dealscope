"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, Loader2, Mail, Send, X } from "lucide-react";
import { toast } from "sonner";
import { closeInfoRequest, createInfoRequest, resendInfoRequest } from "@/server/actions/discovery-requests";
import type { RequestQuestion } from "@/lib/discovery/info-request";
import { cn } from "@/lib/utils";

export type RequestRow = {
  id: string;
  recipient: string;
  email: string | null;
  status: string;
  questions: number;
  answered: number;
  unknown: number;
  sentAt: string | null;
  viewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  link: string;
};

const FIELD =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus:ring-2 focus:ring-primary/30";

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success("Link copied"));
}

export function RequestComposer({
  projectId,
  questions,
  defaultName,
  defaultEmail,
}: {
  projectId: string;
  questions: RequestQuestion[];
  defaultName: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState(() => new Set(questions.filter((q) => q.suggested).map((q) => q.key)));
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();

  const groups = useMemo(() => {
    const shown = showAll ? questions : questions.filter((q) => q.suggested || picked.has(q.key));
    const by = new Map<string, RequestQuestion[]>();
    for (const q of shown) by.set(q.section, [...(by.get(q.section) ?? []), q]);
    return [...by.entries()];
  }, [questions, showAll, picked]);
  const hidden = questions.filter((q) => !q.suggested && !picked.has(q.key)).length;

  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const submit = (send: boolean) =>
    start(async () => {
      const r = await createInfoRequest({
        projectId,
        recipientName: name || null,
        recipientEmail: email || null,
        message: message || null,
        questionKeys: [...picked],
        send,
      });
      if (r?.serverError || r?.validationErrors) return void toast.error(r?.serverError ?? "Check the email address");
      const d = r!.data!;
      if (send && d.emailed) toast.success(`Sent to ${email}`);
      else if (send && d.error) toast.error(`Created, but the email failed: ${d.error}. Copy the link instead.`);
      if (!send || !d.emailed) copy(d.link);
      setMessage("");
      router.refresh();
    });

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send to</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={FIELD} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" className={FIELD} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal note (optional)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Thanks for walking us through the office on Tuesday — just a few details we couldn’t get on site."
          className={cn(FIELD, "h-auto py-2.5")}
        />
      </label>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">
            Questions <span className="font-normal text-muted-foreground">· {picked.size} selected</span>
          </p>
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => setPicked(new Set(questions.map((q) => q.key)))} className="text-primary">
              Select all
            </button>
            <button type="button" onClick={() => setPicked(new Set())} className="text-muted-foreground">
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-[420px] space-y-4 overflow-y-auto rounded-xl border border-border/70 p-3">
          {groups.map(([section, qs]) => (
            <div key={section}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</p>
              <ul className="space-y-0.5">
                {qs.map((q) => (
                  <li key={q.key}>
                    <label className="flex min-h-10 cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent">
                      <input type="checkbox" checked={picked.has(q.key)} onChange={() => toggle(q.key)} className="mt-1 size-4 accent-primary" />
                      <span className="text-[15px] leading-snug">
                        {q.prompt}
                        {!q.suggested && <span className="ml-1.5 text-xs text-muted-foreground">(technical)</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!showAll && hidden > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className="w-full py-1 text-sm font-medium text-primary">
              Show {hidden} more technical question{hidden === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={pending || !picked.size}
          onClick={() => submit(false)}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium disabled:opacity-50"
        >
          <Copy className="size-4" /> Create link only
        </button>
        <button
          type="button"
          disabled={pending || !picked.size || !email}
          onClick={() => submit(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Email {picked.size} question
          {picked.size === 1 ? "" : "s"}
        </button>
      </div>
    </section>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Waiting", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  submitted: { label: "Answered", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground" },
  expired: { label: "Expired", cls: "bg-muted text-muted-foreground" },
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function RequestList({ projectId, requests }: { projectId: string; requests: RequestRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ serverError?: string } | undefined>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r?.serverError) return void toast.error(r.serverError);
      toast.success(ok);
      router.refresh();
    });

  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sent requests</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {requests.map((r) => {
          const s = STATUS[r.status] ?? STATUS.open;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {r.recipient}
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>{s.label}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{r.questions} questions</span>
                  {r.sentAt ? (
                    <span className="flex items-center gap-1">
                      <Mail className="size-3" /> Emailed {day(r.sentAt)}
                    </span>
                  ) : (
                    <span>Link created {day(r.createdAt)}</span>
                  )}
                  {r.viewedAt && (
                    <span className="flex items-center gap-1">
                      <Eye className="size-3" /> Opened {day(r.viewedAt)}
                    </span>
                  )}
                  {r.submittedAt && (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <Check className="size-3" /> {r.answered} answered{r.unknown ? `, ${r.unknown} don’t know` : ""} · {day(r.submittedAt)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-1">
                <IconBtn label="Copy link" onClick={() => copy(r.link)}>
                  <Copy className="size-4" />
                </IconBtn>
                {r.email && r.status !== "submitted" && (
                  <IconBtn label="Resend" disabled={pending} onClick={() => act(() => resendInfoRequest({ projectId, requestId: r.id }), "Sent again")}>
                    <Send className="size-4" />
                  </IconBtn>
                )}
                {r.status !== "closed" && (
                  <IconBtn label="Close link" disabled={pending} onClick={() => act(() => closeInfoRequest({ projectId, requestId: r.id }), "Link closed")}>
                    <X className="size-4" />
                  </IconBtn>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}
