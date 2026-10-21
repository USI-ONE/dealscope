"use client";

import { useRef, useState, useTransition } from "react";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { saveDraft, submitAnswers } from "./actions";

export type FormQuestion = {
  key: string;
  prompt: string;
  hint: string | null;
  type: string;
  options: string[];
  unit: string | null;
  section: string;
};
type Resp = { v: string | string[] | Record<string, string> | null; unknown?: boolean; note?: string };

const INPUT =
  "h-12 w-full rounded-xl border border-[#d9d4c7] bg-white px-3.5 text-[16px] outline-none transition focus:border-[#458C5E] focus:ring-2 focus:ring-[#458C5E]/25";

function answered(r: Resp | undefined) {
  if (!r) return false;
  if (r.unknown) return true;
  const v = r.v;
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Object.values(v).some((s) => s.trim());
}

export function RequestForm({
  token,
  questions,
  initial,
  submitted: wasSubmitted,
}: {
  token: string;
  questions: FormQuestion[];
  initial: Record<string, Resp>;
  submitted: boolean;
}) {
  const [resp, setResp] = useState<Record<string, Resp>>(initial ?? {});
  const [showNote, setShowNote] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.entries(initial ?? {}).map(([k, r]) => [k, !!r.note])),
  );
  const [done, setDone] = useState<null | { answered: number; unknown: number }>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const update = (key: string, patch: Partial<Resp>, immediate = false) => {
    setResp((all) => {
      const next = { ...(all[key] ?? { v: null }), ...patch };
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => void saveDraft(token, key, next), immediate ? 0 : 700);
      return { ...all, [key]: next };
    });
  };

  const count = questions.filter((q) => answered(resp[q.key])).length;

  if (done)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-[#458C5E]" />
        <h2 className="mt-3 text-2xl font-bold">Thank you!</h2>
        <p className="mt-2 text-[15px] text-[#555]">
          We received {done.answered} answer{done.answered === 1 ? "" : "s"}
          {done.unknown ? ` and ${done.unknown} “don’t know”` : ""}. If anything changes, you can come back to this link and update it.
        </p>
        <button type="button" onClick={() => setDone(null)} className="mt-5 text-sm font-medium text-[#458C5E] underline">
          Review my answers
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      {wasSubmitted && (
        <p className="rounded-xl border border-[#458C5E]/30 bg-[#458C5E]/10 px-4 py-3 text-sm text-[#2f6b45]">
          You’ve already sent these answers — you can update anything and send again.
        </p>
      )}
      {questions.map((q, i) => {
        const r = resp[q.key];
        const unknown = !!r?.unknown;
        const ok = answered(r);
        return (
          <section key={q.key} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  ok ? "bg-[#458C5E] text-white" : "bg-[#efeadf] text-[#6b6b6b]"
                }`}
              >
                {ok ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold leading-snug">{q.prompt}</p>
                {q.hint && <p className="mt-0.5 text-sm text-[#6b6b6b]">{q.hint}</p>}

                <fieldset disabled={unknown} className={`mt-3 ${unknown ? "opacity-40" : ""}`}>
                  {q.type === "choice" || q.type === "yn" ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((o) => {
                        const on = r?.v === o;
                        return (
                          <button
                            key={o}
                            type="button"
                            onClick={() => update(q.key, { v: on ? null : o }, true)}
                            className={`min-h-11 rounded-full border px-4 text-[15px] font-medium transition ${
                              on ? "border-[#458C5E] bg-[#458C5E] text-white" : "border-[#d9d4c7] bg-white"
                            }`}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  ) : q.type === "multi" ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((o) => {
                        const list = Array.isArray(r?.v) ? (r!.v as string[]) : [];
                        const on = list.includes(o);
                        return (
                          <button
                            key={o}
                            type="button"
                            onClick={() => update(q.key, { v: on ? list.filter((x) => x !== o) : [...list, o] }, true)}
                            className={`min-h-11 rounded-full border px-4 text-[15px] font-medium transition ${
                              on ? "border-[#458C5E] bg-[#458C5E] text-white" : "border-[#d9d4c7] bg-white"
                            }`}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  ) : q.type === "contact" ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(["name", "phone", "email"] as const).map((k) => {
                        const obj = r?.v && typeof r.v === "object" && !Array.isArray(r.v) ? (r.v as Record<string, string>) : {};
                        return (
                          <input
                            key={k}
                            value={obj[k] ?? ""}
                            onChange={(e) => update(q.key, { v: { ...obj, [k]: e.target.value } })}
                            placeholder={k === "name" ? "Name" : k === "phone" ? "Phone" : "Email"}
                            type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
                            className={INPUT}
                          />
                        );
                      })}
                    </div>
                  ) : q.type === "textarea" ? (
                    <textarea
                      value={typeof r?.v === "string" ? r.v : ""}
                      onChange={(e) => update(q.key, { v: e.target.value })}
                      rows={3}
                      className={`${INPUT} h-auto py-3`}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        value={typeof r?.v === "string" ? r.v : ""}
                        onChange={(e) => update(q.key, { v: e.target.value })}
                        type={q.type === "date" ? "date" : "text"}
                        inputMode={q.type === "number" ? "decimal" : undefined}
                        className={INPUT}
                      />
                      {q.unit && <span className="shrink-0 text-sm text-[#6b6b6b]">{q.unit}</span>}
                    </div>
                  )}
                </fieldset>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-[#555]">
                    <input
                      type="checkbox"
                      checked={unknown}
                      onChange={(e) => update(q.key, { unknown: e.target.checked }, true)}
                      className="size-4 accent-[#458C5E]"
                    />
                    I don’t know
                  </label>
                  {!showNote[q.key] && (
                    <button
                      type="button"
                      onClick={() => setShowNote((s) => ({ ...s, [q.key]: true }))}
                      className="text-sm font-medium text-[#458C5E]"
                    >
                      Add a note
                    </button>
                  )}
                </div>
                {showNote[q.key] && (
                  <textarea
                    value={r?.note ?? ""}
                    onChange={(e) => update(q.key, { note: e.target.value })}
                    placeholder="Anything else we should know?"
                    rows={2}
                    className={`${INPUT} mt-2 h-auto py-2.5 text-[15px]`}
                  />
                )}
              </div>
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-[#f4f1ea] via-[#f4f1ea] to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        {error && <p className="mb-2 text-center text-sm text-red-700">{error}</p>}
        <button
          type="button"
          disabled={pending || count === 0}
          onClick={() =>
            start(async () => {
              setError(null);
              Object.values(timers.current).forEach(clearTimeout);
              const res = await submitAnswers(token, resp);
              if (!res.ok) return setError(res.error ?? "Something went wrong — try again.");
              setDone({ answered: res.answered ?? 0, unknown: res.unknown ?? 0 });
              window.scrollTo({ top: 0, behavior: "smooth" });
            })
          }
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#458C5E] text-[17px] font-semibold text-white shadow-lg transition active:scale-[0.99] disabled:opacity-50"
        >
          {pending && <Loader2 className="size-5 animate-spin" />}
          {pending ? "Sending…" : `Send answers · ${count} of ${questions.length}`}
        </button>
      </div>
    </div>
  );
}
