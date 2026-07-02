"use client";

/**
 * AI-generated briefing narrative — rendered at the top of
 * /diligence/[id]/briefing so the operator opens the page and
 * immediately sees what AI has synthesized:
 *
 *   • Executive summary
 *   • Per-area sections (each with a risk-rating pill)
 *   • Top risks (ranked critical → low)
 *   • Top opportunities
 *   • 100-day runbook — the ordered, do-by-when work list the
 *     operator can hand to a transition team
 *
 * If no draft has been generated yet, shows a clear empty state
 * with a "Generate" CTA. Operator can also regenerate any time —
 * each click writes a new versioned row in diligence_briefings.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { generateBriefingDraft } from "@/server/actions/diligence-ai";
import { Button } from "@/components/ui/button";

type Draft = {
  executiveSummary: string;
  sections: Array<{
    heading: string;
    body: string;
    riskRating: "info" | "low" | "medium" | "high" | "critical";
  }>;
  topRisks: Array<{
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    narrative: string;
  }>;
  topOpportunities: Array<{ title: string; narrative: string }>;
  hundredDayPlan: string[];
};

const PILL =
  "inline-block rounded border border-black bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-black";

export function BriefingNarrativeCard({
  engagementId,
  draft,
  version,
  generatedByName,
  generatedAt,
  canEdit,
}: {
  engagementId: string;
  draft: Draft | null;
  version: number | null;
  generatedByName: string | null;
  generatedAt: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showRunbookOnly, setShowRunbookOnly] = useState(false);

  const generate = () => {
    start(async () => {
      const r = await generateBriefingDraft({ engagementId });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (!data) {
        toast.error("No response from AI");
        return;
      }
      toast.success(`Briefing v${data.version} generated`);
      router.refresh();
    });
  };

  if (!draft) {
    return (
      <section className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center">
        <Sparkles className="mx-auto mb-2 size-6 text-primary" />
        <h3 className="text-base font-semibold">No AI briefing yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Once you've captured questionnaire responses (or extracted answers
          from uploaded files), generate the AI briefing here. It synthesizes
          everything into an executive summary, per-area narrative, ranked
          risks, opportunities, and a 100-day runbook the sponsor can act on.
        </p>
        {canEdit && (
          <Button onClick={generate} disabled={pending} className="mt-4">
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            Generate briefing now
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-6 print:break-inside-avoid">
      {/* Header strip with provenance + regenerate button */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-2 text-xs print:hidden">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
            AI briefing
          </span>
          <span className="text-muted-foreground">
            v{version}
            {generatedAt && ` · ${new Date(generatedAt).toLocaleString()}`}
            {generatedByName && ` · by ${generatedByName}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRunbookOnly((v) => !v)}
            className="h-7 text-xs"
          >
            <ListChecks className="mr-1 size-3" />
            {showRunbookOnly ? "Show full narrative" : "Show runbook only"}
          </Button>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={generate}
              disabled={pending}
              className="h-7 text-xs"
            >
              {pending ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 size-3" />
              )}
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* Runbook-only mode: skip exec summary + sections, jump to the
          100-day plan + top risks. Useful when the operator just wants
          the actionable list to print or hand off. */}
      {showRunbookOnly ? (
        <>
          {draft.hundredDayPlan.length > 0 && (
            <Section title="First 100 days — runbook">
              <HundredDayPlan items={draft.hundredDayPlan} />
            </Section>
          )}
          {draft.topRisks.length > 0 && (
            <Section title="Top risks">
              <TopRisks risks={draft.topRisks} />
            </Section>
          )}
        </>
      ) : (
        <>
          {/* Executive summary */}
          {draft.executiveSummary && (
            <Section title="Executive summary">
              <p className="text-base leading-relaxed">
                {draft.executiveSummary}
              </p>
            </Section>
          )}

          {/* Per-area narrative sections */}
          {draft.sections.length > 0 && (
            <Section title="Area narratives">
              <div className="space-y-5">
                {draft.sections.map((s, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold tracking-tight">
                        {s.heading}
                      </h3>
                      <span className={PILL}>{s.riskRating}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Top risks */}
          {draft.topRisks.length > 0 && (
            <Section title="Top risks">
              <TopRisks risks={draft.topRisks} />
            </Section>
          )}

          {/* Top opportunities */}
          {draft.topOpportunities.length > 0 && (
            <Section title="Top opportunities">
              <ul className="space-y-3">
                {draft.topOpportunities.map((o, i) => (
                  <li key={i} className="rounded-md border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="font-semibold">{o.title}</div>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {o.narrative}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* 100-day runbook */}
          {draft.hundredDayPlan.length > 0 && (
            <Section title="First 100 days — runbook">
              <HundredDayPlan items={draft.hundredDayPlan} />
            </Section>
          )}
        </>
      )}

      {/* Divider between AI narrative and the structured tables below */}
      <div className="border-t pt-4 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Supporting structured data follows
      </div>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 text-left"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          {title}
        </h2>
      </button>
      {open && children}
    </section>
  );
}

function TopRisks({
  risks,
}: {
  risks: Array<{
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    narrative: string;
  }>;
}) {
  return (
    <ol className="space-y-3">
      {risks.map((r, i) => (
        <li key={i} className="rounded-md border bg-background p-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={PILL}>{r.severity}</span>
            <span className="font-semibold">{r.title}</span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {r.narrative}
          </p>
        </li>
      ))}
    </ol>
  );
}

function HundredDayPlan({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
      <ol className="space-y-2">
        {items.map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-md border bg-background p-2.5"
          >
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
