"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  clearEngagementResponse,
  setEngagementResponse,
} from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type Question,
  type QuestionKind,
} from "@/lib/diligence/question-library";
import { type Industry } from "@/lib/diligence/industries";
import { SuggestNextButton } from "./suggest-next-button";
import { WorksheetTools } from "./worksheet-tools";

export type ResponseRow = {
  questionKey: string;
  value: unknown;
  satisfactory: boolean;
  notes: string | null;
};

type ViewMode = "grid" | "list";

export function QuestionnaireCard({
  engagementId,
  industry,
  questions,
  responses,
  canEdit,
  aiEnabled,
}: {
  engagementId: string;
  industry: Industry | null;
  questions: Question[];
  responses: ResponseRow[];
  canEdit: boolean;
  /** Hides the AI-only "Suggest next 5" button when false. */
  aiEnabled: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "unanswered" | "unsatisfactory">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // When a question key is selected (e.g. from a Suggest-next click), drill
  // into its topic and scroll to it on render.
  const [scrollToKey, setScrollToKey] = useState<string | null>(null);

  // Index responses by questionKey for O(1) lookup.
  const responseMap = useMemo(() => {
    const m = new Map<string, ResponseRow>();
    for (const r of responses) m.set(r.questionKey, r);
    return m;
  }, [responses]);

  // Pre-compute per-category metadata.
  type CatStats = {
    name: string;
    questions: Question[];
    answered: number;
    satisfactory: number;
    total: number;
    subcategories: string[];
  };
  const categoryOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const q of questions) {
      if (!seen.has(q.category)) {
        seen.add(q.category);
        order.push(q.category);
      }
    }
    return order;
  }, [questions]);

  const categoriesAll: CatStats[] = useMemo(() => {
    const map = new Map<string, CatStats>();
    for (const q of questions) {
      const c = map.get(q.category) ?? {
        name: q.category,
        questions: [],
        answered: 0,
        satisfactory: 0,
        total: 0,
        subcategories: [],
      };
      c.questions.push(q);
      c.total += 1;
      const r = responseMap.get(q.key);
      if (r) c.answered += 1;
      if (r?.satisfactory) c.satisfactory += 1;
      if (!c.subcategories.includes(q.subcategory)) {
        c.subcategories.push(q.subcategory);
      }
      map.set(q.category, c);
    }
    return categoryOrder.map((name) => map.get(name)!).filter(Boolean);
  }, [questions, responseMap, categoryOrder]);

  // Apply the search/filter to compute matching counts per category. We
  // use these to dim categories that have nothing matching the current
  // filter, so the dashboard view stays useful with filter "Unanswered".
  const searchTerm = search.trim().toLowerCase();
  const matchesFilter = (q: Question) => {
    if (searchTerm) {
      const hay = `${q.text} ${q.category} ${q.subcategory}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    const r = responseMap.get(q.key);
    if (filter === "unanswered" && r) return false;
    if (filter === "unsatisfactory" && r?.satisfactory) return false;
    return true;
  };

  const matchedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of categoriesAll) {
      m.set(c.name, c.questions.filter(matchesFilter).length);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesAll, search, filter, responseMap]);

  // Overall progress.
  const total = questions.length;
  const answered = questions.filter((q) => responseMap.has(q.key)).length;
  const satisfactory = questions.filter(
    (q) => responseMap.get(q.key)?.satisfactory,
  ).length;
  const pctAnswered = total === 0 ? 0 : Math.round((answered / total) * 100);
  const pctSatisfactory =
    total === 0 ? 0 : Math.round((satisfactory / total) * 100);

  // Active category navigation.
  const goToCategory = (name: string) => {
    setActiveCategory(name);
    setScrollToKey(null);
  };
  const goToQuestion = (key: string) => {
    const q = questions.find((x) => x.key === key);
    if (!q) return;
    setActiveCategory(q.category);
    setScrollToKey(key);
  };
  const goPrevCategory = () => {
    if (!activeCategory) return;
    const idx = categoryOrder.indexOf(activeCategory);
    if (idx > 0) goToCategory(categoryOrder[idx - 1]);
  };
  const goNextCategory = () => {
    if (!activeCategory) return;
    const idx = categoryOrder.indexOf(activeCategory);
    if (idx >= 0 && idx < categoryOrder.length - 1)
      goToCategory(categoryOrder[idx + 1]);
  };

  // When a scroll target is set, find the row and scroll to it after paint.
  useEffect(() => {
    if (!scrollToKey) return;
    const el = document.querySelector(
      `[data-question-key="${scrollToKey}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      const t = setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary");
        setScrollToKey(null);
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [scrollToKey, activeCategory]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Diligence questionnaire</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Universal IT scope plus{" "}
              {industry ? "industry-specific" : "(set an industry for industry-specific)"}{" "}
              prompts. Mark a question <em>satisfactory</em> when you're
              confident in the answer; that's the metric the briefing draft
              uses.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Answered</span>
              <span className="font-semibold tabular-nums">
                {answered}/{total}
              </span>
              <span className="text-muted-foreground">({pctAnswered}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Satisfactory</span>
              <span className="font-semibold tabular-nums">
                {satisfactory}/{total}
              </span>
              <span className="text-muted-foreground">({pctSatisfactory}%)</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pctSatisfactory}%` }}
          />
        </div>

        {/* Filters + view toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions"
              className="h-9 pl-7"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All</option>
            <option value="unanswered">Unanswered</option>
            <option value="unsatisfactory">Not yet satisfactory</option>
          </select>
          <div className="inline-flex h-9 overflow-hidden rounded-md border border-input">
            <button
              type="button"
              onClick={() => {
                setView("grid");
                setActiveCategory(null);
              }}
              className={`flex items-center gap-1 px-2 text-xs ${
                view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent"
              }`}
              aria-label="Topic dashboard view"
            >
              <LayoutGrid className="size-3.5" /> Topics
            </button>
            <button
              type="button"
              onClick={() => {
                setView("list");
                setActiveCategory(null);
              }}
              className={`flex items-center gap-1 px-2 text-xs ${
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent"
              }`}
              aria-label="Full list view"
            >
              <List className="size-3.5" /> Outline
            </button>
          </div>
          {canEdit && aiEnabled && (
            <SuggestNextButton
              engagementId={engagementId}
              questionMeta={questions.map((q) => ({
                key: q.key,
                text: q.text,
                category: q.category,
              }))}
              onJumpToQuestion={goToQuestion}
            />
          )}
        </div>

        <WorksheetTools engagementId={engagementId} canEdit={canEdit} />
      </CardHeader>

      <CardContent>
        {/* === Topic dashboard (grid view, no active category) === */}
        {view === "grid" && !activeCategory && (
          <TopicGrid
            categories={categoriesAll}
            matchedCounts={matchedCounts}
            onSelect={goToCategory}
            filterActive={filter !== "all" || searchTerm.length > 0}
          />
        )}

        {/* === Focused topic (grid view, active category) === */}
        {view === "grid" && activeCategory && (
          <FocusedTopic
            category={categoriesAll.find((c) => c.name === activeCategory)}
            engagementId={engagementId}
            responseMap={responseMap}
            canEdit={canEdit}
            matchesFilter={matchesFilter}
            onBack={() => setActiveCategory(null)}
            onPrev={goPrevCategory}
            onNext={goNextCategory}
            hasPrev={
              !!activeCategory && categoryOrder.indexOf(activeCategory) > 0
            }
            hasNext={
              !!activeCategory &&
              categoryOrder.indexOf(activeCategory) < categoryOrder.length - 1
            }
            prevName={
              activeCategory
                ? categoryOrder[categoryOrder.indexOf(activeCategory) - 1] ??
                  null
                : null
            }
            nextName={
              activeCategory
                ? categoryOrder[categoryOrder.indexOf(activeCategory) + 1] ??
                  null
                : null
            }
          />
        )}

        {/* === Outline (full list — original behaviour) === */}
        {view === "list" && (
          <OutlineView
            categories={categoriesAll}
            engagementId={engagementId}
            responseMap={responseMap}
            canEdit={canEdit}
            matchesFilter={matchesFilter}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================================
 * Topic dashboard — grid of category cards
 * ========================================================================== */
function TopicGrid({
  categories,
  matchedCounts,
  onSelect,
  filterActive,
}: {
  categories: Array<{
    name: string;
    questions: Question[];
    answered: number;
    satisfactory: number;
    total: number;
    subcategories: string[];
  }>;
  matchedCounts: Map<string, number>;
  onSelect: (name: string) => void;
  filterActive: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {filterActive
          ? "Cards show how many questions in each topic match your filter. Click a topic to drill in."
          : "Pick the topic the conversation is on. Click a topic to focus on its questions."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const matched = matchedCounts.get(c.name) ?? 0;
          const dimmed = filterActive && matched === 0;
          const pct = c.total === 0 ? 0 : Math.round((c.satisfactory / c.total) * 100);
          const tone =
            pct >= 75
              ? "bg-emerald-500"
              : pct >= 40
                ? "bg-amber-500"
                : "bg-rose-500";
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => onSelect(c.name)}
              disabled={dimmed}
              className={`group rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 ${
                dimmed ? "opacity-40" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2 max-sm:flex-wrap">
                <h3 className="text-sm font-semibold">{c.name}</h3>
                <div className="flex shrink-0 items-center gap-1">
                  {c.answered > c.satisfactory && (
                    <span
                      className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-300"
                      title={`${c.answered} answered (drafts + satisfactory)`}
                    >
                      {c.answered} draft
                    </span>
                  )}
                  <span
                    className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                    title="Satisfactory / total"
                  >
                    {c.satisfactory}/{c.total}
                  </span>
                </div>
              </div>
              <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                {/* Lighter "answered" bar underneath */}
                <div
                  className="absolute inset-y-0 left-0 bg-muted-foreground/30"
                  style={{
                    width: `${c.total === 0 ? 0 : Math.round((c.answered / c.total) * 100)}%`,
                  }}
                />
                {/* Brighter "satisfactory" bar on top */}
                <div
                  className={`absolute inset-y-0 left-0 transition-all ${tone}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {filterActive && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {matched} match{matched === 1 ? "" : "es"} for current filter
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {c.subcategories.slice(0, 4).map((s) => (
                  <span
                    key={s}
                    className="rounded bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
                {c.subcategories.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{c.subcategories.length - 4} more
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open <ChevronRight className="size-3" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
 * Focused topic — single category in detail
 * ========================================================================== */
function FocusedTopic({
  category,
  engagementId,
  responseMap,
  canEdit,
  matchesFilter,
  onBack,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  prevName,
  nextName,
}: {
  category:
    | {
        name: string;
        questions: Question[];
        answered: number;
        satisfactory: number;
        total: number;
        subcategories: string[];
      }
    | undefined;
  engagementId: string;
  responseMap: Map<string, ResponseRow>;
  canEdit: boolean;
  matchesFilter: (q: Question) => boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  prevName: string | null;
  nextName: string | null;
}) {
  if (!category) {
    return (
      <div className="text-sm text-muted-foreground">Topic not found.</div>
    );
  }
  // Group by subcategory.
  type SubGroup = { subcategory: string; questions: Question[] };
  const subs: SubGroup[] = [];
  for (const q of category.questions) {
    if (!matchesFilter(q)) continue;
    let s = subs.find((x) => x.subcategory === q.subcategory);
    if (!s) {
      s = { subcategory: q.subcategory, questions: [] };
      subs.push(s);
    }
    s.questions.push(q);
  }

  return (
    <div className="space-y-4">
      {/* Sticky topic header */}
      <div className="sticky top-0 z-10 -mx-3 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 size-3.5" /> All topics
          </Button>
          <h2 className="text-base font-bold uppercase tracking-wider">
            {category.name}
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {category.satisfactory}/{category.total} satisfactory
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{
                width: `${category.total === 0 ? 0 : Math.round((category.satisfactory / category.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {subs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No questions in this topic match the current filter.
        </p>
      ) : (
        <div className="space-y-5">
          {subs.map((sub) => (
            <div key={sub.subcategory} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {sub.subcategory}
              </h3>
              <div className="space-y-2">
                {sub.questions.map((q) => (
                  <QuestionRow
                    key={q.key}
                    question={q}
                    response={responseMap.get(q.key) ?? null}
                    engagementId={engagementId}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom topic nav */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={!hasPrev}
          title={prevName ?? undefined}
        >
          <ChevronLeft className="mr-1 size-3.5" />
          {prevName ? `Prev — ${prevName}` : "Prev"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack}>
          All topics
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasNext}
          title={nextName ?? undefined}
        >
          {nextName ? `Next — ${nextName}` : "Next"}
          <ChevronRight className="ml-1 size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ============================================================================
 * Outline view — original full-list (for power users)
 * ========================================================================== */
function OutlineView({
  categories,
  engagementId,
  responseMap,
  canEdit,
  matchesFilter,
}: {
  categories: Array<{
    name: string;
    questions: Question[];
    answered: number;
    satisfactory: number;
    total: number;
    subcategories: string[];
  }>;
  engagementId: string;
  responseMap: Map<string, ResponseRow>;
  canEdit: boolean;
  matchesFilter: (q: Question) => boolean;
}) {
  // Group by subcategory inside each category, applying the filter.
  type Sub = { subcategory: string; questions: Question[] };
  type Cat = { category: string; subs: Sub[] };
  const grouped: Cat[] = [];
  for (const c of categories) {
    const matched = c.questions.filter(matchesFilter);
    if (matched.length === 0) continue;
    const subs: Sub[] = [];
    for (const q of matched) {
      let s = subs.find((x) => x.subcategory === q.subcategory);
      if (!s) {
        s = { subcategory: q.subcategory, questions: [] };
        subs.push(s);
      }
      s.questions.push(q);
    }
    grouped.push({ category: c.name, subs });
  }

  if (grouped.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No questions match this filter.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map((cat) => (
        <details
          key={cat.category}
          className="rounded-md border"
          open
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 bg-muted/30 px-3 py-2 text-sm font-semibold uppercase tracking-wider hover:bg-muted/50">
            <span>{cat.category}</span>
            <span className="text-xs font-normal normal-case text-muted-foreground">
              {cat.subs.reduce((n, s) => n + s.questions.length, 0)} question
              {cat.subs.reduce((n, s) => n + s.questions.length, 0) === 1
                ? ""
                : "s"}
            </span>
          </summary>
          <div className="space-y-3 p-3">
            {cat.subs.map((sub) => (
              <div key={sub.subcategory} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {sub.subcategory}
                </h4>
                <div className="space-y-2">
                  {sub.questions.map((q) => (
                    <QuestionRow
                      key={q.key}
                      question={q}
                      response={responseMap.get(q.key) ?? null}
                      engagementId={engagementId}
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/* ============================================================================
 * QuestionRow + ResponseEditor (unchanged from before)
 * ========================================================================== */
function QuestionRow({
  question,
  response,
  engagementId,
  canEdit,
}: {
  question: Question;
  response: ResponseRow | null;
  engagementId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div
        data-question-key={question.key}
        className="flex items-start justify-between gap-3 rounded border bg-card p-3 text-sm transition-shadow"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <span className="font-medium">{question.text}</span>
            {response?.satisfactory && (
              <Badge
                variant="default"
                className="text-[10px] uppercase tracking-wider"
              >
                <Check className="mr-0.5 size-3" /> Satisfactory
              </Badge>
            )}
            {response && !response.satisfactory && (
              <Badge variant="outline" className="text-[10px] uppercase">
                Draft
              </Badge>
            )}
          </div>
          {question.hint && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {question.hint}
            </p>
          )}
          <div className="mt-2 text-sm text-muted-foreground">
            {response ? (
              <RenderValue value={response.value} kind={question.kind} unit={question.unit} />
            ) : (
              <span className="italic">No answer yet.</span>
            )}
          </div>
          {response?.notes && (
            <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs text-muted-foreground">
              {response.notes}
            </p>
          )}
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="shrink-0"
          >
            {response ? "Edit" : "Answer"}
          </Button>
        )}
      </div>
    );
  }
  return (
    <ResponseEditor
      question={question}
      response={response}
      engagementId={engagementId}
      onDone={() => setEditing(false)}
    />
  );
}

function RenderValue({
  value,
  kind,
  unit,
}: {
  value: unknown;
  kind: QuestionKind;
  unit?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="italic">No answer yet.</span>;
  }
  if (kind === "yes_no") {
    return <span className="font-medium">{value ? "Yes" : "No"}</span>;
  }
  if (kind === "multiselect" && Array.isArray(value)) {
    return <span>{value.length === 0 ? "—" : value.join(", ")}</span>;
  }
  if (kind === "number") {
    return (
      <span className="font-medium tabular-nums">
        {String(value)}
        {unit ? ` ${unit}` : ""}
      </span>
    );
  }
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

function ResponseEditor({
  question,
  response,
  engagementId,
  onDone,
}: {
  question: Question;
  response: ResponseRow | null;
  engagementId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const initial = response?.value;
  const [textValue, setTextValue] = useState<string>(
    typeof initial === "string" || typeof initial === "number"
      ? String(initial)
      : "",
  );
  const [boolValue, setBoolValue] = useState<"yes" | "no" | "">(
    initial === true ? "yes" : initial === false ? "no" : "",
  );
  const [selectValue, setSelectValue] = useState<string>(
    typeof initial === "string" ? initial : "",
  );
  const [multiValue, setMultiValue] = useState<string[]>(
    Array.isArray(initial) ? (initial as string[]) : [],
  );
  const [satisfactory, setSatisfactory] = useState(response?.satisfactory ?? false);
  const [notes, setNotes] = useState(response?.notes ?? "");

  const submit = (markSatisfactory?: boolean) => {
    let value: string | number | boolean | string[] | null;
    switch (question.kind) {
      case "yes_no":
        value = boolValue === "" ? null : boolValue === "yes";
        break;
      case "number":
        value = textValue === "" ? null : Number(textValue);
        if (typeof value === "number" && Number.isNaN(value)) {
          toast.error("Enter a valid number");
          return;
        }
        break;
      case "select":
        value = selectValue || null;
        break;
      case "multiselect":
        value = multiValue;
        break;
      default:
        value = textValue.trim() === "" ? null : textValue.trim();
    }
    const sat = markSatisfactory ?? satisfactory;
    start(async () => {
      const r = await setEngagementResponse({
        engagementId,
        questionKey: question.key,
        value,
        satisfactory: sat,
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(sat ? "Marked satisfactory" : "Saved");
        onDone();
        router.refresh();
      }
    });
  };

  const clear = () => {
    if (!response) {
      onDone();
      return;
    }
    start(async () => {
      const r = await clearEngagementResponse({
        engagementId,
        questionKey: question.key,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Answer cleared");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div
      data-question-key={question.key}
      className="space-y-3 rounded border bg-muted/10 p-3"
    >
      <div>
        <Label className="text-sm">{question.text}</Label>
        {question.hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{question.hint}</p>
        )}
      </div>

      {question.kind === "text" && (
        <Input
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          autoFocus
        />
      )}
      {question.kind === "longtext" && (
        <Textarea
          rows={4}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          autoFocus
        />
      )}
      {question.kind === "number" && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            autoFocus
            className="max-w-[14rem]"
          />
          {question.unit && (
            <span className="text-xs text-muted-foreground">{question.unit}</span>
          )}
        </div>
      )}
      {question.kind === "yes_no" && (
        <div className="flex items-center gap-2">
          {(["yes", "no", ""] as const).map((v) => (
            <Button
              key={v || "unset"}
              type="button"
              variant={boolValue === v ? "default" : "outline"}
              size="sm"
              onClick={() => setBoolValue(v)}
            >
              {v === "yes" ? "Yes" : v === "no" ? "No" : "Unset"}
            </Button>
          ))}
        </div>
      )}
      {question.kind === "select" && question.options && (
        <select
          value={selectValue}
          onChange={(e) => setSelectValue(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">— Select —</option>
          {question.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {question.kind === "multiselect" && question.options && (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((o) => {
            const checked = multiValue.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() =>
                  setMultiValue((curr) =>
                    curr.includes(o) ? curr.filter((x) => x !== o) : [...curr, o],
                  )
                }
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                {checked && <Check className="mr-1 inline size-3" />}
                {o}
              </button>
            );
          })}
        </div>
      )}

      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Interviewer notes (optional)
        </Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Context, follow-ups, evidence references"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={satisfactory}
          onChange={(e) => setSatisfactory(e.target.checked)}
        />
        Mark satisfactory (counted toward briefing readiness)
      </label>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {response && (
          <Button variant="outline" size="sm" onClick={clear} disabled={pending}>
            Clear answer
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        {!satisfactory && (
          <Button size="sm" variant="outline" onClick={() => submit(false)} disabled={pending}>
            Save draft
          </Button>
        )}
        <Button size="sm" onClick={() => submit(true)} disabled={pending}>
          {pending ? "Saving…" : "Save & mark satisfactory"}
        </Button>
      </div>
    </div>
  );
}
