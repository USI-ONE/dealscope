"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudOff, Loader2, MessageSquarePlus, Sparkles } from "lucide-react";
import type { DiscoveryAnswerValue } from "@/db/schema/discovery";
import { EXTRA_DEFS, hasValue, isFieldComplete, photoMode, type AnswerState } from "@/lib/discovery/templates";
import type { ResolvedField } from "@/lib/discovery/types";
import { cn } from "@/lib/utils";
import {
  ChecklistInput,
  ChoiceChips,
  ContactInput,
  INPUT_CLS,
  NumberInput,
  SignaturePad,
  TEXTAREA_CLS,
  YesNo,
  type Contact,
  type Signature,
} from "./field-inputs";
import { useOutbox } from "./outbox-provider";
import { PhotoStrip, useTargetPhotos } from "./photo-strip";
import { useDiscoveryProject, type ServerPhoto } from "./project-context";

type V = DiscoveryAnswerValue["v"];

export function QuestionCard({
  field,
  initial,
  serverPhotos,
  suggestion,
  highlight,
}: {
  field: ResolvedField;
  initial: AnswerState | undefined;
  serverPhotos: ServerPhoto[];
  suggestion?: { count: number; label: string };
  highlight?: boolean;
}) {
  const { projectId, canEdit } = useDiscoveryProject();
  const outbox = useOutbox();
  const [value, setValue] = useState<V>(initial?.value?.v);
  const [extras, setExtras] = useState<Record<string, string | number | null>>(initial?.value?.extras ?? {});
  const [na, setNa] = useState(initial?.notApplicable ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!initial?.notes);
  const [touched, setTouched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ value, extras, na, notes });
  const cardRef = useRef<HTMLDivElement>(null);

  latest.current = { value, extras, na, notes };

  useEffect(() => {
    if (highlight) cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);

  // Flush a pending debounce if the card unmounts (section change).
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        send();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function send() {
    timer.current = null;
    const s = latest.current;
    outbox.saveAnswer({
      projectId,
      questionKey: field.questionKey,
      value: { v: s.value ?? null, extras: s.extras },
      notApplicable: s.na,
      notes: s.notes || null,
    });
  }

  function schedule(immediate = false) {
    setTouched(true);
    if (timer.current) clearTimeout(timer.current);
    if (immediate) {
      // Let state settle into `latest` first.
      timer.current = setTimeout(send, 0);
    } else {
      timer.current = setTimeout(send, 600);
    }
  }

  const photos = useTargetPhotos({ questionKey: field.questionKey }, serverPhotos);
  const complete = isFieldComplete(field, { value: { v: value }, notApplicable: na, notes }, photos.length);
  const pending = outbox.isPending(`answer:${projectId}:${field.questionKey}`) || timer.current !== null;
  const mode = photoMode(field);

  const setV = (v: V, immediate = false) => {
    setValue(v);
    latest.current.value = v;
    schedule(immediate);
  };

  const input = (() => {
    const disabled = !canEdit || na;
    const wrap = (node: React.ReactNode) => (
      <fieldset disabled={disabled} className={cn(disabled && "pointer-events-none opacity-50")}>
        {node}
      </fieldset>
    );
    switch (field.type) {
      case "photo":
        return null;
      case "choice":
        return wrap(<ChoiceChips options={field.options ?? []} value={value as string | undefined} onChange={(v) => setV(v, true)} />);
      case "multi":
        return wrap(
          <ChoiceChips multi options={field.options ?? []} value={(value as string[] | undefined) ?? []} onChange={(v) => setV(v, true)} />,
        );
      case "yn":
        return wrap(<YesNo value={value as string | undefined} onChange={(v) => setV(v, true)} />);
      case "number":
        return wrap(
          <NumberInput
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(s) => setV(s === "" ? null : s)}
            unit={field.unit}
            placeholder={field.placeholder}
          />,
        );
      case "date":
        return wrap(<input type="date" value={(value as string) ?? ""} onChange={(e) => setV(e.target.value, true)} className={INPUT_CLS} />);
      case "textarea":
        return wrap(
          <textarea value={(value as string) ?? ""} onChange={(e) => setV(e.target.value)} placeholder={field.placeholder} className={TEXTAREA_CLS} />,
        );
      case "checklist":
        return wrap(<ChecklistInput items={field.items ?? []} value={(value as string[] | undefined) ?? []} onChange={(v) => setV(v, true)} />);
      case "contact":
        return wrap(<ContactInput value={((value as Contact) ?? {}) as Contact} onChange={(v) => setV(v as Record<string, string>)} />);
      case "signature":
        return wrap(
          <SignaturePad value={((value as Signature) ?? {}) as Signature} onChange={(v) => setV(v as Record<string, string>, true)} />,
        );
      default:
        return wrap(
          <input
            value={(value as string) ?? ""}
            onChange={(e) => setV(e.target.value)}
            placeholder={field.placeholder}
            enterKeyHint="next"
            className={INPUT_CLS}
          />,
        );
    }
  })();

  return (
    <div
      ref={cardRef}
      id={`q-${field.questionKey}`}
      className={cn(
        "scroll-mt-28 rounded-2xl border bg-card p-4 shadow-sm transition-colors",
        highlight ? "border-primary ring-2 ring-primary/30" : "border-border",
        na && "bg-muted/40",
      )}
    >
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">
            {field.label}
            {mode === "required" && <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">· photo</span>}
          </p>
          {field.hint && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{field.hint}</p>}
        </div>
        <span className="mt-0.5 flex h-5 shrink-0 items-center" aria-live="polite">
          {pending ? (
            outbox.online ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />
            ) : (
              <CloudOff className="size-4 text-amber-500" aria-label="Saved on device" />
            )
          ) : complete ? (
            <CheckCircle2 className="size-5 text-emerald-600" aria-label={touched ? "Saved" : "Answered"} />
          ) : null}
        </span>
      </div>

      {input}

      {suggestion && suggestion.count > 0 && !na && String(value ?? "") !== String(suggestion.count) && canEdit && (
        <button
          type="button"
          onClick={() => setV(String(suggestion.count), true)}
          className="mt-2 flex min-h-9 items-center gap-1.5 rounded-full bg-violet-500/10 px-3 text-sm font-medium text-violet-700 active:scale-95 dark:text-violet-300"
        >
          <Sparkles className="size-4" /> Use {suggestion.count} ({suggestion.label})
        </button>
      )}

      {field.extras && field.extras.length > 0 && (
        <div className={cn("mt-3 space-y-3", na && "pointer-events-none opacity-50")}>
          {field.extras.map((k) => {
            const def = EXTRA_DEFS[k];
            const cur = extras[k];
            const set = (v: string | number | null, immediate = false) => {
              const next = { ...latest.current.extras, [k]: v };
              setExtras(next);
              latest.current.extras = next;
              schedule(immediate);
            };
            return (
              <div key={k}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{def.label}</p>
                {def.type === "choice" ? (
                  <ChoiceChips size="sm" options={def.options ?? []} value={(cur as string) ?? undefined} onChange={(v) => set((v as string) ?? null, true)} />
                ) : def.type === "number" ? (
                  <NumberInput value={cur === null || cur === undefined ? "" : String(cur)} onChange={(s) => set(s === "" ? null : s)} unit={def.unit} />
                ) : (
                  <input value={(cur as string) ?? ""} onChange={(e) => set(e.target.value)} className={INPUT_CLS} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {mode !== "none" && (
        <div className="mt-3">
          <PhotoStrip
            target={{ questionKey: field.questionKey, sectionKey: field.sectionKey }}
            serverPhotos={serverPhotos}
            title={field.label}
            required={mode === "required" && !na}
          />
        </div>
      )}

      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            latest.current.notes = e.target.value;
            schedule();
          }}
          disabled={!canEdit}
          placeholder="Notes"
          className={cn(TEXTAREA_CLS, "mt-3 min-h-[72px]")}
        />
      )}

      {canEdit && (
        <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => {
              const next = !na;
              setNa(next);
              latest.current.na = next;
              schedule(true);
            }}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-sm font-medium active:scale-95",
              na ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
            )}
            aria-pressed={na}
          >
            N/A
          </button>
          {!showNotes && (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground active:bg-accent"
            >
              <MessageSquarePlus className="size-4" /> Note
            </button>
          )}
          {hasValue(value) && !["photo", "signature", "checklist"].includes(field.type) && (
            <button
              type="button"
              onClick={() => setV(null, true)}
              className="ml-auto min-h-9 rounded-full px-3 text-sm text-muted-foreground active:bg-accent"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
