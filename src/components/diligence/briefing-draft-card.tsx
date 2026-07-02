"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateBriefingDraft } from "@/server/actions/diligence-ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const PILL = "inline-block rounded border border-black bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-black";

export function BriefingDraftCard({
  engagementId,
  canEdit,
  satisfactoryCount,
  totalCount,
}: {
  engagementId: string;
  canEdit: boolean;
  satisfactoryCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [version, setVersion] = useState<number | null>(null);

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
      setDraft(data.draft);
      setVersion(data.version);
      toast.success(`Briefing v${data.version} generated`);
      router.refresh();
    });
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              AI · Generate briefing draft
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Assesses all collected responses across IT, Legal, Finance,
              Facilities, and HR — producing a Good / Bad / Ugly executive
              briefing with ranked risks, opportunities, and a 100-day plan.
              Each generation creates a new versioned draft.
            </p>
          </div>
          {canEdit && (
            <Button onClick={generate} disabled={pending}>
              <Sparkles className="mr-1 size-3.5" />
              {pending ? "Generating…" : "Generate draft"}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {satisfactoryCount}/{totalCount} questions answered satisfactory across all tracks. Draft
          responses, findings, cost lines, and sessions all feed into the briefing — mark
          answers satisfactory once confirmed so the AI weights them higher.
        </p>
      </CardHeader>
      {draft && (
        <CardContent className="space-y-6">
          <div className="text-xs text-muted-foreground">
            Version {version} · generated just now
          </div>

          <Section title="Executive summary">
            <p className="whitespace-pre-wrap text-sm">{draft.executiveSummary}</p>
          </Section>

          {draft.sections.length > 0 && (
            <Section title="Sections">
              <div className="space-y-3">
                {draft.sections.map((s, i) => (
                  <div key={i} className="rounded border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{s.heading}</h4>
                      <span className={PILL}>{s.riskRating}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {draft.topRisks.length > 0 && (
            <Section title="Top risks">
              <ul className="space-y-2">
                {draft.topRisks.map((r, i) => (
                  <li key={i} className="rounded border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      <span className={PILL}>{r.severity}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {r.narrative}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {draft.topOpportunities.length > 0 && (
            <Section title="Top opportunities">
              <ul className="space-y-2">
                {draft.topOpportunities.map((o, i) => (
                  <li key={i} className="rounded border bg-card p-3">
                    <div className="font-medium">{o.title}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {o.narrative}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {draft.hundredDayPlan.length > 0 && (
            <Section title="100-day plan">
              <ol className="list-inside list-decimal space-y-1 text-sm">
                {draft.hundredDayPlan.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </Section>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </button>
      {open && children}
    </section>
  );
}
