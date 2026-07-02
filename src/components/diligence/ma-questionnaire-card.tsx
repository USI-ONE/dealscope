"use client";

import { useMemo, useState, useTransition } from "react";
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
import { type MaQuestion, type MaTrack } from "@/lib/diligence/ma-question-library";

export type MaResponseRow = {
  questionKey: string;
  value: unknown;
  satisfactory: boolean;
  notes: string | null;
};

type ViewMode = "grid" | "list";
type FilterMode = "all" | "unanswered" | "unsatisfactory";

const TRACK_LABELS: Record<MaTrack, string> = {
  legal: "Legal",
  finance: "Finance",
  facilities: "Facilities",
  hr: "HR",
};

const TRACK_DESCRIPTIONS: Record<MaTrack, string> = {
  legal: "Corporate structure, contracts, IP, litigation, regulatory, and data privacy.",
  finance: "Financial statements, revenue quality, EBITDA, debt, cash flow, and tax.",
  facilities: "Real property, leases, building condition, CapEx, and environmental.",
  hr: "Headcount, compensation, benefits, key people, labor relations, and culture.",
};

export function MaQuestionnaireCard({
  engagementId,
  track,
  questions,
  responses,
  canEdit,
}: {
  engagementId: string;
  track: MaTrack;
  questions: MaQuestion[];
  responses: MaResponseRow[];
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const responseMap = useMemo(() => {
    const m = new Map<string, MaResponseRow>();
    for (const r of responses) m.set(r.questionKey, r);
    return m;
  }, [responses]);

  // Stable category order.
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

  type CatStats = {
    name: string;
    questions: MaQuestion[];
    answered: number;
    satisfactory: number;
    total: number;
    subcategories: string[];
  };

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
      if (r && r.value != null && String(r.value).trim() !== "") c.answered += 1;
      if (r?.satisfactory) c.satisfactory += 1;
      if (!c.subcategories.includes(q.subcategory)) c.subcategories.push(q.subcategory);
      map.set(q.category, c);
    }
    return categoryOrder.map((name) => map.get(name)!).filter(Boolean);
  }, [questions, responseMap, categoryOrder]);

  const searchTerm = search.trim().toLowerCase();
  const matchesFilter = (q: MaQuestion) => {
    if (searchTerm) {
      const hay = `${q.text} ${q.category} ${q.subcategory}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    const r = responseMap.get(q.key);
    const hasValue = r && r.value != null && String(r.value).trim() !== "";
    if (filter === "unanswered" && hasValue) return false;
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

  // Overall stats.
  const total = questions.length;
  const answered = categoriesAll.reduce((n, c) => n + c.answered, 0);
  const satisfactory = categoriesAll.reduce((n, c) => n + c.satisfactory, 0);
  const pctAnswered = total === 0 ? 0 : Math.round((answered / total) * 100);
  const pctSatisfactory = total === 0 ? 0 : Math.round((satisfactory / total) * 100);

  const goToCategory = (name: string) => setActiveCategory(name);
  const goPrevCategory = () => {
    if (!activeCategory) return;
    const idx = categoryOrder.indexOf(activeCategory);
    if (idx > 0) setActiveCategory(categoryOrder[idx - 1]);
  };
  const goNextCategory = () => {
    if (!activeCategory) return;
    const idx = categoryOrder.indexOf(activeCategory);
    if (idx >= 0 && idx < categoryOrder.length - 1) setActiveCategory(categoryOrder[idx + 1]);
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{TRACK_LABELS[track]} Diligence</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {TRACK_DESCRIPTIONS[track]}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Answered</span>
              <span className="font-semibold tabular-nums">{answered}/{total}</span>
              <span className="text-muted-foreground">({pctAnswered}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Satisfactory</span>
              <span className="font-semibold tabular-nums">{satisfactory}/{total}</span>
              <span className="text-muted-foreground">({pctSatisfactory}%)</span>
            </div>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pctSatisfactory}%` }}
          />
        </div>

        {/* Search + filter + view toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions"
              className="h-9 pl-7"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All</option>
            <option value="unanswered">Unanswered</option>
            <option value="unsatisfactory">Not yet satisfactory</option>
          </select>
          <div className="inline-flex h-9 overflow-hidden rounded-md border border-input">
            <button
              type="button"
              onClick={() => { setView("grid"); setActiveCategory(null); }}
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
              onClick={() => { setView("list"); setActiveCategory(null); }}
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
        </div>
      </CardHeader>

      <CardContent>
        {/* Topic grid */}
        {view === "grid" && !activeCategory && (
          <TopicGrid
            categories={categoriesAll}
            matchedCounts={matchedCounts}
            onSelect={goToCategory}
            filterActive={filter !== "all" || searchTerm.length > 0}
          />
        )}

        {/* Focused topic */}
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
            hasPrev={!!activeCategory && categoryOrder.indexOf(activeCategory) > 0}
            hasNext={
              !!activeCategory &&
              categoryOrder.indexOf(activeCategory) < categoryOrder.length - 1
            }
            prevName={
              activeCategory
                ? categoryOrder[categoryOrder.indexOf(activeCategory) - 1] ?? null
                : null
            }
            nextName={
              activeCategory
                ? categoryOrder[categoryOrder.indexOf(activeCategory) + 1] ?? null
                : null
            }
          />
        )}

        {/* Outline view */}
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
 * Topic grid — cards with dual progress bars
 * ========================================================================== */
function TopicGrid({
  categories,
  matchedCounts,
  onSelect,
  filterActive,
}: {
  categories: Array<{
    name: string;
    questions: MaQuestion[];
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
            pct >= 75 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
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
              <div className="flex items-start justify-between gap-2">
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
                <div
                  className="absolute inset-y-0 left-0 bg-muted-foreground/30"
                  style={{
                    width: `${c.total === 0 ? 0 : Math.round((c.answered / c.total) * 100)}%`,
                  }}
                />
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
 * Focused topic — single category drill-in with subcategory sections
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
        questions: MaQuestion[];
        answered: number;
        satisfactory: number;
        total: number;
        subcategories: string[];
      }
    | undefined;
  engagementId: string;
  responseMap: Map<string, MaResponseRow>;
  canEdit: boolean;
  matchesFilter: (q: MaQuestion) => boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  prevName: string | null;
  nextName: string | null;
}) {
  if (!category) {
    return <div className="text-sm text-muted-foreground">Topic not found.</div>;
  }

  type SubGroup = { subcategory: string; questions: MaQuestion[] };
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
      <div className="sticky top-0 z-10 -mx-3 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 size-3.5" /> All topics
          </Button>
          <h2 className="text-base font-bold uppercase tracking-wider">{category.name}</h2>
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!hasPrev} title={prevName ?? undefined}>
          <ChevronLeft className="mr-1 size-3.5" />
          {prevName ? `Prev — ${prevName}` : "Prev"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack}>All topics</Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext} title={nextName ?? undefined}>
          {nextName ? `Next — ${nextName}` : "Next"}
          <ChevronRight className="ml-1 size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ============================================================================
 * Outline view — full linear list grouped by category → subcategory
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
    questions: MaQuestion[];
    answered: number;
    satisfactory: number;
    total: number;
    subcategories: string[];
  }>;
  engagementId: string;
  responseMap: Map<string, MaResponseRow>;
  canEdit: boolean;
  matchesFilter: (q: MaQuestion) => boolean;
}) {
  type Sub = { subcategory: string; questions: MaQuestion[] };
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
    return <p className="text-sm text-muted-foreground">No questions match this filter.</p>;
  }

  return (
    <div className="space-y-3">
      {grouped.map((cat) => (
        <details key={cat.category} className="rounded-md border" open>
          <summary className="flex cursor-pointer items-center justify-between gap-3 bg-muted/30 px-3 py-2 text-sm font-semibold uppercase tracking-wider hover:bg-muted/50">
            <span>{cat.category}</span>
            <span className="text-xs font-normal normal-case text-muted-foreground">
              {cat.subs.reduce((n, s) => n + s.questions.length, 0)} question
              {cat.subs.reduce((n, s) => n + s.questions.length, 0) === 1 ? "" : "s"}
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
 * QuestionRow — individual question display + inline editor
 * ========================================================================== */
function QuestionRow({
  question,
  response,
  engagementId,
  canEdit,
}: {
  question: MaQuestion;
  response: MaResponseRow | null;
  engagementId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const hasValue =
    response && response.value != null && String(response.value).trim() !== "";
  const isSatisfactory = response?.satisfactory ?? false;

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3 rounded border bg-card p-3 text-sm transition-shadow">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <span className="font-medium">{question.text}</span>
            {isSatisfactory && (
              <Badge variant="default" className="text-[10px] uppercase tracking-wider">
                <Check className="mr-0.5 size-3" /> Satisfactory
              </Badge>
            )}
            {hasValue && !isSatisfactory && (
              <Badge variant="outline" className="text-[10px] uppercase">Draft</Badge>
            )}
          </div>
          {question.hint && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{question.hint}</p>
          )}
          <div className="mt-2 text-sm text-muted-foreground">
            {hasValue ? (
              <RenderValue value={response!.value} kind={question.kind} unit={question.unit} />
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
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="shrink-0">
            {hasValue ? "Edit" : "Answer"}
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
      pending={pending}
      start={start}
      router={router}
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
  kind: MaQuestion["kind"];
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

/* ============================================================================
 * ResponseEditor — inline form matching IT questionnaire style
 * ========================================================================== */
function ResponseEditor({
  question,
  response,
  engagementId,
  pending,
  start,
  router,
  onDone,
}: {
  question: MaQuestion;
  response: MaResponseRow | null;
  engagementId: string;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
  router: ReturnType<typeof useRouter>;
  onDone: () => void;
}) {
  const initial = response?.value;
  const [textValue, setTextValue] = useState<string>(
    typeof initial === "string" || typeof initial === "number" ? String(initial) : "",
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
    if (!response) { onDone(); return; }
    start(async () => {
      const r = await clearEngagementResponse({ engagementId, questionKey: question.key });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Answer cleared");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded border bg-muted/10 p-3">
      <div>
        <Label className="text-sm">{question.text}</Label>
        {question.hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{question.hint}</p>
        )}
      </div>

      {question.kind === "text" && (
        <Input value={textValue} onChange={(e) => setTextValue(e.target.value)} autoFocus />
      )}
      {question.kind === "longtext" && (
        <Textarea rows={4} value={textValue} onChange={(e) => setTextValue(e.target.value)} autoFocus />
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
          {question.unit && <span className="text-xs text-muted-foreground">{question.unit}</span>}
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
          {question.options.map((o) => <option key={o} value={o}>{o}</option>)}
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
