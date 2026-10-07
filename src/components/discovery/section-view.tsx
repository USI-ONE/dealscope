"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Grid2x2 } from "lucide-react";
import { toast } from "sonner";
import { setDiscoverySectionNa } from "@/server/actions/discovery";
import { getTemplate, isFieldComplete, sectionFields, type AnswerState } from "@/lib/discovery/templates";
import { cn } from "@/lib/utils";
import { SectionIcon } from "./section-icon";
import { useOutbox } from "./outbox-provider";
import { QuestionCard } from "./question-card";
import { RecordList, type RecordRow } from "./record-list";
import { useDiscoveryProject, type ServerPhoto } from "./project-context";

type NavTarget = { key: string; title: string } | null;

export function SectionView({
  templateKey,
  sectionKey,
  answers,
  records,
  photos,
  suggestions,
  sectionNa,
  prev,
  next,
  focus,
}: {
  templateKey: string;
  sectionKey: string;
  answers: Record<string, AnswerState>;
  records: Record<string, RecordRow[]>;
  photos: ServerPhoto[];
  suggestions: Record<string, { count: number; label: string }>;
  sectionNa: boolean;
  prev: NavTarget;
  next: NavTarget;
  focus?: string;
}) {
  const router = useRouter();
  const { projectId, canEdit } = useDiscoveryProject();
  const outbox = useOutbox();
  const section = getTemplate(templateKey).sections.find((s) => s.key === sectionKey)!;
  const [showIntro, setShowIntro] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [na, setNa] = useState(sectionNa);
  const [pendingNa, startNa] = useTransition();

  const photosByQuestion = useMemo(() => {
    const m = new Map<string, ServerPhoto[]>();
    for (const p of photos) {
      if (!p.questionKey) continue;
      const list = m.get(p.questionKey) ?? [];
      list.push(p);
      m.set(p.questionKey, list);
    }
    return m;
  }, [photos]);

  // Overlay answers still sitting in this device's outbox.
  const effective = (qk: string): AnswerState | undefined => {
    const p = outbox.pendingAnswer(projectId, qk);
    if (p) return { value: p.value as AnswerState["value"], notApplicable: p.notApplicable, notes: p.notes };
    return answers[qk];
  };

  // Snapshot of open questions when the filter is switched on, so cards
  // don't vanish mid-typing.
  const [openSnapshot, setOpenSnapshot] = useState<Set<string>>(new Set());
  const fields = sectionFields(section);
  const toggleOnlyOpen = () => {
    if (!onlyOpen) {
      setOpenSnapshot(
        new Set(
          fields
            .filter((f) => !isFieldComplete(f, effective(f.questionKey), photosByQuestion.get(f.questionKey)?.length ?? 0))
            .map((f) => f.questionKey),
        ),
      );
    }
    setOnlyOpen(!onlyOpen);
  };

  const done = fields.filter((f) =>
    isFieldComplete(f, effective(f.questionKey), photosByQuestion.get(f.questionKey)?.length ?? 0),
  ).length;

  const toggleNa = () => {
    const nextNa = !na;
    setNa(nextNa);
    startNa(async () => {
      const r = await setDiscoverySectionNa({ projectId, sectionKey, na: nextNa });
      if (r?.serverError) {
        setNa(!nextNa);
        toast.error(r.serverError);
      } else router.refresh();
    });
  };

  if (!outbox.ready) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Sticky section header */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:-mx-7 md:px-7">
        <div className="flex items-center gap-2">
          <Link
            href={`/discovery/${projectId}`}
            className="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-accent"
            aria-label="All sections"
          >
            <Grid2x2 className="size-5" />
          </Link>
          <SectionIcon name={section.icon} className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold leading-tight">{section.title}</h1>
            <p className="text-xs text-muted-foreground">
              {na ? "Marked N/A" : `${done} of ${fields.length} answered`}
              {Object.keys(records).length > 0 &&
                ` · ${Object.values(records).reduce((n, r) => n + r.length, 0)} records`}
            </p>
          </div>
          {fields.length > 3 && !na && (
            <button
              type="button"
              onClick={toggleOnlyOpen}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3 text-[13px] font-medium",
                onlyOpen ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {onlyOpen ? "Open only" : "All"}
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 pt-4">
        {section.intro && (
          <button
            type="button"
            onClick={() => setShowIntro(!showIntro)}
            className="w-full rounded-2xl bg-muted/60 p-3.5 text-left text-[13px] leading-relaxed text-muted-foreground"
          >
            <span className={cn(!showIntro && "line-clamp-2")}>{section.intro}</span>
            <ChevronDown className={cn("mx-auto mt-1 size-4 transition", showIntro && "rotate-180")} />
          </button>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={toggleNa}
            disabled={pendingNa}
            className={cn(
              "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-[15px]",
              na ? "border-foreground bg-foreground text-background" : "border-dashed border-border text-muted-foreground",
            )}
          >
            <span>{na ? "This section is N/A for this site" : "Not applicable at this site?"}</span>
            <span className="text-sm font-semibold">{na ? "Undo" : "Mark N/A"}</span>
          </button>
        )}

        {!na &&
          section.blocks.map((block, i) =>
            block.kind === "table" ? (
              <section key={block.table.key} className="space-y-3">
                <RecordList
                  table={block.table}
                  sectionKey={section.key}
                  serverRows={records[block.table.key] ?? []}
                  photos={photos.filter((p) => p.recordId)}
                />
              </section>
            ) : (
              <section key={`f${i}`} className="space-y-3">
                {block.title && <h2 className="pt-2 text-[17px] font-semibold">{block.title}</h2>}
                {block.intro && <p className="text-[13px] text-muted-foreground">{block.intro}</p>}
                {block.fields.map((f) => {
                  const qk = `${section.key}.${f.key}`;
                  if (onlyOpen && !openSnapshot.has(qk)) return null;
                  return (
                    <QuestionCard
                      key={qk}
                      field={{ ...f, questionKey: qk, sectionKey: section.key }}
                      initial={effective(qk)}
                      serverPhotos={photosByQuestion.get(qk) ?? []}
                      suggestion={suggestions[qk]}
                      highlight={focus === qk}
                    />
                  );
                })}
              </section>
            ),
          )}
      </div>

      {/* Thumb-reach section navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-3 pt-2 backdrop-blur md:left-56"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          {prev ? (
            <Link
              href={`/discovery/${projectId}/s/${prev.key}`}
              className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-xl border border-border px-3 text-sm font-medium active:bg-accent"
            >
              <ChevronLeft className="size-5 shrink-0" />
              <span className="truncate">{prev.title}</span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/discovery/${projectId}/s/${next.key}`}
              className="flex h-12 min-w-0 flex-1 items-center justify-end gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground active:opacity-90"
            >
              <span className="truncate">{next.title}</span>
              <ChevronRight className="size-5 shrink-0" />
            </Link>
          ) : (
            <Link
              href={`/discovery/${projectId}`}
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
            >
              Back to overview
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
