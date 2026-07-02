/**
 * Server-only Anthropic client + diligence helpers.
 *
 * Centralises model selection, prompt caching, and the "knowledge pack" that
 * gets passed to every diligence call so the question library + engagement
 * context cache cleanly across requests.
 *
 * Caching strategy
 * - The system prompt is split into a stable header (frozen across requests)
 *   and a dynamic engagement context appended after the cache breakpoint.
 * - The full question catalog is rendered into the cached portion so we
 *   don't send it as input every call. With ~250 questions this is a
 *   meaningful ~6-8K-token saving per request once the cache is warm.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Industry } from "@/lib/diligence/industries";
import { INDUSTRY_LABELS } from "@/lib/diligence/industries";
import {
  type Question,
  getQuestionsForIndustry,
} from "@/lib/diligence/question-library";
import { ALL_MA_QUESTIONS } from "@/lib/diligence/ma-question-library";
import { PublicError } from "@/server/safe-action";

let _client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Throw PublicError so the real reason reaches the toast — otherwise
    // next-safe-action collapses it to "Something went wrong while
    // executing the operation."
    throw new PublicError(
      "AI features aren't configured yet. An owner needs to set ANTHROPIC_API_KEY in the Vercel project (and redeploy).",
    );
  }
  // Strip UTF-8 BOM (0xFEFF) that PowerShell sometimes prepends to env vars
  const cleanKey = apiKey.replace(/^﻿/, "").trim();
  _client = new Anthropic({ apiKey: cleanKey });
  return _client;
}

/** Default model for all DealScope AI features. */
export const AI_MODEL = "claude-opus-4-8" as const;

/* ============================================================================
 * Prompt construction
 * ========================================================================== */

/**
 * The frozen system header — never changes between requests so it caches
 * cleanly. Describes the assistant's role and the diligence context.
 */
const SYSTEM_HEADER = `You are DealScope Diligence AI, an expert M&A diligence partner embedded in a pre-acquisition platform. Your job is to help an experienced diligence team across five tracks — IT, Legal, Finance, Facilities, and HR — evaluate a target company for acquisition.

Your capabilities:
  1. Extract structured answers from raw interview notes against a fixed question catalog.
  2. Suggest the highest-leverage follow-up questions in real time.
  3. Draft a comprehensive executive briefing from collected evidence across all tracks.

Operating principles:
- The question catalog is canonical. When extracting, only return answers tied to a question key from the catalog. Do not invent question keys.
- Question keys are prefixed by track: IT questions have no prefix (e.g. "infra.servers"); Legal start with "legal."; Finance with "finance."; Facilities with "facilities."; HR with "hr.".
- Treat absence of evidence as absence of answer. Never fabricate a number, vendor, or claim.
- When notes are ambiguous, flag the ambiguity rather than guessing.
- Quote evidence verbatim from the notes when proposing an answer.
- Keep tone direct and concrete, in line with how a diligence partner would brief a deal sponsor.
- Format numerical answers in the unit the question specifies (e.g. "Mbps", "users", "$M").
- For yes/no answers, return literal booleans (true/false), never "yes"/"no" strings.
- For multiselect answers, return the chosen options exactly as they appear in the question's options list.
`;

/**
 * Render the full question catalog as compact JSON inside the system prompt.
 * Stable byte-for-byte so it caches.
 */
function renderCatalog(questions: Question[]): string {
  const compact = questions.map((q: Question & { track?: string }) => ({
    key: q.key,
    // Include track for MA questions so AI knows the diligence area.
    ...(q.track ? { track: q.track } : { track: "it" }),
    category: q.category,
    subcategory: q.subcategory,
    text: q.text,
    kind: q.kind,
    ...(q.unit ? { unit: q.unit } : {}),
    ...(q.options ? { options: q.options } : {}),
  }));
  return `# Question Catalog (${questions.length} questions across IT, Legal, Finance, Facilities, HR)\n\n${JSON.stringify(compact, null, 2)}`;
}

export type EngagementContext = {
  engagementId: string;
  targetCompanyName: string;
  industry: Industry | null;
  summary: string | null;
  responses: Array<{
    questionKey: string;
    value: unknown;
    satisfactory: boolean;
    notes: string | null;
  }>;
  /** Optional — only loaded for the briefing call. */
  findings?: Array<{
    refCode: string;
    severity: "low" | "medium" | "high" | "critical" | "info";
    status: string;
    immediate: boolean;
    title: string;
    narrative: string | null;
  }>;
  costLines?: Array<{
    workItem: string;
    lowCents: number;
    highCents: number;
    recurring: boolean;
    timing: string;
    category: string | null;
    notes: string | null;
    findingId: string | null;
    costType: string | null;
  }>;
  artifacts?: Array<{
    kind: string;
    title: string;
    summary: string | null;
    riskLevel: string;
    needsAttention: boolean;
    notes: string | null;
  }>;
  sessions?: Array<{
    title: string;
    scheduledAt: Date | null;
    mode: string;
    summary: string | null;
  }>;
  /** Applicable standards for the linked client (if any), with current
   *  per-control assessment rollup. The briefing call uses this to
   *  weight remediation recommendations toward closing required-standard
   *  gaps. */
  applicableStandards?: Array<{
    /** "engagement" = the TARGET's posture as discovered during diligence.
     *  "buyer-client" = the buyer's own compliance posture (what the
     *  buyer has historically attested to). */
    scope: "engagement" | "buyer-client";
    name: string;
    version: string | null;
    source: string;
    isRequired: boolean;
    inheritedFromGroup: string | null;
    rationale: string | null;
    rollup: {
      total: number;
      compliant: number;
      partial: number;
      nonCompliant: number;
      notApplicable: number;
      unknown: number;
    };
    /** Open gaps (non-compliant + partial) — control codes/titles/current evidence. */
    openGaps: Array<{
      code: string | null;
      title: string;
      status: string;
      evidence: string | null;
      guidance: string | null;
    }>;
  }>;
};

function renderEngagementContext(ctx: EngagementContext): string {
  const industryLabel = ctx.industry ? INDUSTRY_LABELS[ctx.industry] : "Unspecified";

  // Group responses by track for clarity.
  const byTrack: Record<string, typeof ctx.responses> = {
    IT: [],
    Legal: [],
    Finance: [],
    Facilities: [],
    HR: [],
  };
  for (const r of ctx.responses) {
    const prefix = r.questionKey.split(".")[0];
    if (prefix === "legal") byTrack.Legal.push(r);
    else if (prefix === "finance") byTrack.Finance.push(r);
    else if (prefix === "facilities") byTrack.Facilities.push(r);
    else if (prefix === "hr") byTrack.HR.push(r);
    else byTrack.IT.push(r);
  }

  const formatResponses = (rows: typeof ctx.responses) =>
    rows.length === 0
      ? "  (none collected)"
      : rows
          .map((r) => {
            const v = JSON.stringify(r.value);
            const flag = r.satisfactory ? "SATISFACTORY" : "DRAFT";
            const note = r.notes ? ` // ${r.notes}` : "";
            return `  [${flag}] ${r.questionKey} = ${v}${note}`;
          })
          .join("\n");

  const totalAnswered = ctx.responses.length;
  const totalSatisfactory = ctx.responses.filter((r) => r.satisfactory).length;

  const parts: string[] = [];
  parts.push(`# Engagement Context

Target: ${ctx.targetCompanyName}
Industry: ${industryLabel}
Engagement summary: ${ctx.summary ?? "(not provided)"}

# Collected Responses (${totalAnswered} total, ${totalSatisfactory} satisfactory)

NOTE: Both SATISFACTORY and DRAFT responses are legitimate evidence sources. DRAFT means unconfirmed — the value is real (often from inventories or documents). Cite drafts as provisional facts rather than omitting them.

## IT Track (${byTrack.IT.length} responses)
${formatResponses(byTrack.IT)}

## Legal Track (${byTrack.Legal.length} responses)
${formatResponses(byTrack.Legal)}

## Finance Track (${byTrack.Finance.length} responses)
${formatResponses(byTrack.Finance)}

## Facilities Track (${byTrack.Facilities.length} responses)
${formatResponses(byTrack.Facilities)}

## HR Track (${byTrack.HR.length} responses)
${formatResponses(byTrack.HR)}`);

  if (ctx.findings && ctx.findings.length > 0) {
    const lines = ctx.findings
      .map(
        (f) =>
          `  ${f.refCode} [${f.severity.toUpperCase()}${f.immediate ? "/IMMEDIATE" : ""}] [${f.status}] ${f.title}${f.narrative ? `\n     ${f.narrative.replace(/\n/g, "\n     ")}` : ""}`,
      )
      .join("\n");
    parts.push(`# Findings logged (${ctx.findings.length})\n\n${lines}`);
  }

  if (ctx.costLines && ctx.costLines.length > 0) {
    // Build a lookup of finding metadata for linked cost lines
    const findingMeta = new Map<string, { refCode: string; severity: string; title: string }>();
    for (const f of ctx.findings ?? []) {
      findingMeta.set(f.refCode, { refCode: f.refCode, severity: f.severity, title: f.title });
    }

    // Group cost lines: linked to a finding vs. engagement-level
    // We only have refCode on findings in this context, so match via the findings array
    // Build refCode→finding map from context
    const findingRefToMeta = new Map<string, { refCode: string; severity: string; title: string }>();
    for (const f of ctx.findings ?? []) findingRefToMeta.set(f.refCode, f);

    // Cost lines carry findingId (UUID); findings in context only have refCode.
    // We group by findingId (UUID) and render the finding info from costLines.findingId.
    // Since ctx.findings doesn't carry the id, we render linked lines grouped by
    // findingId and label them with the refCode where available.
    const linkedLines = ctx.costLines.filter((c) => c.findingId);
    const engagementLines = ctx.costLines.filter((c) => !c.findingId);

    const formatLine = (c: typeof ctx.costLines[0]) => {
      const hi = (c.highCents / 100).toLocaleString();
      const lo = (c.lowCents / 100).toLocaleString();
      const type = c.costType ? `[${c.costType}]` : "";
      return `    ${type} "${c.workItem}" — High: $${hi}${c.recurring ? "/yr" : ""} · Low: $${lo} (${c.timing})${c.notes ? `\n       Note: ${c.notes}` : ""}`;
    };

    const sectionParts: string[] = [];

    if (linkedLines.length > 0) {
      // Group by findingId
      const byFinding = new Map<string, typeof ctx.costLines>();
      for (const c of linkedLines) {
        const key = c.findingId!;
        if (!byFinding.has(key)) byFinding.set(key, []);
        byFinding.get(key)!.push(c);
      }
      const findingBlocks: string[] = [];
      for (const [, lines] of byFinding) {
        const subtotalHigh = lines.reduce((s, c) => s + (c.recurring ? 0 : c.highCents), 0);
        const recurHigh = lines.reduce((s, c) => s + (c.recurring ? c.highCents : 0), 0);
        const firstLine = lines[0];
        // Label: we don't have refCode here, just note it's finding-linked
        const header = `  Finding-linked cost group (finding_id: ${firstLine.findingId})`;
        const body = lines.map(formatLine).join("\n");
        const subtotal = subtotalHigh > 0 ? `\n    Subtotal one-time high: $${(subtotalHigh / 100).toLocaleString()}` : "";
        const recur = recurHigh > 0 ? `\n    Recurring high: $${(recurHigh / 100).toLocaleString()}/yr` : "";
        findingBlocks.push(`${header}\n${body}${subtotal}${recur}`);
      }
      sectionParts.push(`## Linked to findings\n${findingBlocks.join("\n\n")}`);
    }

    if (engagementLines.length > 0) {
      const body = engagementLines.map(formatLine).join("\n");
      sectionParts.push(`## Engagement-level (not linked to a specific finding)\n${body}`);
    }

    const totalOneTimeHigh = ctx.costLines.filter((c) => !c.recurring).reduce((s, c) => s + c.highCents, 0);
    const totalRecurHigh = ctx.costLines.filter((c) => c.recurring).reduce((s, c) => s + c.highCents, 0);
    const overhead25 = Math.round(totalOneTimeHigh * 0.25);

    const summary = [
      `Total one-time high: $${(totalOneTimeHigh / 100).toLocaleString()}`,
      totalRecurHigh > 0 ? `Total recurring annual high: $${(totalRecurHigh / 100).toLocaleString()}/yr` : null,
      `Est. 25% taxes & overhead burden: +$${(overhead25 / 100).toLocaleString()}`,
      `TOTAL WITH OVERHEAD: $${((totalOneTimeHigh + overhead25) / 100).toLocaleString()} one-time`,
    ].filter(Boolean).join("\n");

    parts.push(`# Remediation Cost Lines (${ctx.costLines.length} total)\n\n${sectionParts.join("\n\n")}\n\n${summary}`);
  }

  if (ctx.artifacts && ctx.artifacts.length > 0) {
    const lines = ctx.artifacts
      .map(
        (a) =>
          `  ${a.kind} | ${a.title} [${a.riskLevel}${a.needsAttention ? "/ATTENTION" : ""}]${a.summary ? ` — ${a.summary}` : ""}${a.notes ? `\n     ${a.notes}` : ""}`,
      )
      .join("\n");
    parts.push(`# Artifacts on file (${ctx.artifacts.length})\n\n${lines}`);
  }

  if (ctx.sessions && ctx.sessions.length > 0) {
    const lines = ctx.sessions
      .map((s) => {
        const when = s.scheduledAt ? new Date(s.scheduledAt).toISOString().slice(0, 10) : "unscheduled";
        return `  ${when} (${s.mode}) — ${s.title}${s.summary ? `\n     ${s.summary}` : ""}`;
      })
      .join("\n");
    parts.push(`# Sessions held (${ctx.sessions.length})\n\n${lines}`);
  }

  if (ctx.applicableStandards && ctx.applicableStandards.length > 0) {
    const blocks = ctx.applicableStandards.map((s) => {
      const r = s.rollup;
      const pct = r.total === 0 ? 0 : Math.round((r.compliant / r.total) * 100);
      const scopeTag =
        s.scope === "engagement"
          ? "TARGET POSTURE (engagement-level assessment from discovery)"
          : s.inheritedFromGroup
            ? `BUYER POSTURE — INHERITED from ${s.inheritedFromGroup}`
            : "BUYER POSTURE";
      const requiredTag = s.isRequired ? "REQUIRED" : "ASPIRATIONAL";
      const header = `## ${s.name}${s.version ? ` (${s.version})` : ""} — ${requiredTag} — ${scopeTag}\n  Source family: ${s.source}\n  Posture: ${r.compliant}/${r.total} compliant (${pct}%) · ${r.partial} partial · ${r.nonCompliant} non-compliant · ${r.notApplicable} N/A · ${r.unknown} unknown${s.rationale ? `\n  Why it applies: ${s.rationale}` : ""}`;
      if (s.openGaps.length === 0) {
        return `${header}\n  No open gaps.`;
      }
      const gapLines = s.openGaps
        .slice(0, 30)
        .map(
          (g) =>
            `    [${g.status.toUpperCase()}] ${g.code ? `${g.code} · ` : ""}${g.title}${g.guidance ? `\n        Expected: ${g.guidance}` : ""}${g.evidence ? `\n        Current: ${g.evidence}` : ""}`,
        )
        .join("\n");
      const more =
        s.openGaps.length > 30
          ? `\n    ...and ${s.openGaps.length - 30} more open gaps.`
          : "";
      return `${header}\n  Open gaps:\n${gapLines}${more}`;
    });
    parts.push(
      `# Applicable compliance standards (${ctx.applicableStandards.length})

These are the frameworks that apply. There are two scopes:
- TARGET POSTURE entries are direct measurements of THIS engagement's discovery against the standard. The compliance gaps here are real, observed-on-the-target gaps — they are the most material remediation items for the briefing.
- BUYER POSTURE entries are the buyer's own historical attestation against the same standards (or inherited from the buyer's PE firm). Use them as context for what the buyer cares about, but the briefing should focus on TARGET-side gaps when both are available.

REQUIRED standards have regulatory, contractual, or insurance weight — recommendations should prioritize closing their open gaps. Inherited standards (PE-firm portfolio baselines) carry the same weight as REQUIRED for an acquisition.

${blocks.join("\n\n")}`,
    );
  }

  return parts.join("\n\n");
}

/**
 * Build a cached system prompt: stable header + question catalog (cached) +
 * engagement context (uncached, varies per engagement). Prompt-caching
 * breakpoint sits at the end of the catalog so requests against the same
 * industry replay the catalog from cache.
 */
export function buildSystemPrompt(
  questions: Question[],
  engagement: EngagementContext,
): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: SYSTEM_HEADER,
    },
    {
      type: "text",
      text: renderCatalog(questions),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: renderEngagementContext(engagement),
    },
  ];
}

/* ============================================================================
 * Schema-shaped helpers (structured outputs)
 * ========================================================================== */

/** A single answer the AI proposes to extract from notes. */
export type ExtractedAnswer = {
  questionKey: string;
  value: string | number | boolean | string[] | null;
  evidence: string; // verbatim quote from the notes
  confidence: "high" | "medium" | "low";
};

/** Suggested next questions to ask, in priority order. */
export type SuggestedQuestion = {
  questionKey: string;
  rationale: string;
  framingHint: string; // a coaching tip on HOW to ask it
};

/** Briefing draft sections. */
export type BriefingDraft = {
  executiveSummary: string;
  sections: Array<{
    heading: string;
    body: string;
    riskRating: "info" | "low" | "medium" | "high" | "critical";
  }>;
  topRisks: Array<{ title: string; severity: "low" | "medium" | "high" | "critical"; narrative: string }>;
  topOpportunities: Array<{ title: string; narrative: string }>;
  hundredDayPlan: string[];
};

/* ============================================================================
 * Helper: load engagement context from DB
 * ========================================================================== */
export async function loadEngagementContext(
  engagementId: string,
  organizationId: string,
  options?: { includeFull?: boolean },
): Promise<{ context: EngagementContext; questions: Question[] }> {
  const { db } = await import("@/db");
  const {
    diligenceArtifacts,
    diligenceCostLines,
    diligenceEngagementResponses,
    diligenceEngagements,
    diligenceFindings,
    diligenceSessions,
  } = await import("@/db/schema");
  const { and, asc, eq } = await import("drizzle-orm");

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, engagementId),
      eq(diligenceEngagements.organizationId, organizationId),
    ),
  });
  if (!engagement) throw new Error("Engagement not found");

  const responses = await db
    .select({
      questionKey: diligenceEngagementResponses.questionKey,
      value: diligenceEngagementResponses.value,
      satisfactory: diligenceEngagementResponses.satisfactory,
      notes: diligenceEngagementResponses.notes,
    })
    .from(diligenceEngagementResponses)
    .where(eq(diligenceEngagementResponses.engagementId, engagementId));

  // All questions across all five tracks. IT questions are industry-filtered;
  // MA track questions apply universally (no industry filtering).
  const itQuestions = getQuestionsForIndustry(engagement.industry ?? null);
  const questions = [...itQuestions, ...(ALL_MA_QUESTIONS as unknown as Question[])];

  const context: EngagementContext = {
    engagementId: engagement.id,
    targetCompanyName: engagement.targetCompanyName,
    industry: engagement.industry ?? null,
    summary: engagement.summary,
    responses: responses.map((r) => ({
      questionKey: r.questionKey,
      value: r.value,
      satisfactory: r.satisfactory,
      notes: r.notes,
    })),
  };

  // Heavy joins are gated — only the briefing call needs everything.
  if (options?.includeFull) {
    // If the engagement is tied to a buyer client, pull the buyer's
    // applicable standards (with rollup + open gaps). This lets the
    // briefing AI weight recommendations toward closing gaps in
    // standards the buyer is required to attain — including any
    // inherited from the buyer's PE-firm / parent ownership group.
    let applicableStandards: EngagementContext["applicableStandards"];
    if (engagement.clientId) {
      const { loadApplicableStandardsWithRollup } = await import(
        "@/lib/compliance/applicable-standards"
      );
      const { ownershipGroups: ownershipGroupsTable, standardControls } =
        await import("@/db/schema");
      const rolled = await loadApplicableStandardsWithRollup(
        engagement.clientId,
        organizationId,
      );
      // Resolve inheritedFromGroup labels in one shot
      const groupIds = Array.from(
        new Set(
          rolled
            .filter((r) => r.source === "inherited")
            .map((r) => r.standard.ownershipGroupId)
            .filter((x): x is string => !!x),
        ),
      );
      const groupNameById = new Map<string, string>();
      if (groupIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        const groups = await db
          .select({
            id: ownershipGroupsTable.id,
            name: ownershipGroupsTable.name,
          })
          .from(ownershipGroupsTable)
          .where(inArray(ownershipGroupsTable.id, groupIds));
        for (const g of groups) groupNameById.set(g.id, g.name);
      }

      // Pull controls + assessments for these standards (cap to required
      // ones to keep token usage in check; aspirational ones still go in
      // but with a smaller open-gap window).
      const standardIds = rolled.map((r) => r.standard.id);
      const allControls =
        standardIds.length > 0
          ? await db
              .select()
              .from(standardControls)
              .where(
                (
                  await import("drizzle-orm")
                ).inArray(standardControls.standardId, standardIds),
              )
          : [];
      const { clientControlAssessments } = await import("@/db/schema");
      const allAssessments =
        engagement.clientId && standardIds.length > 0
          ? await db
              .select()
              .from(clientControlAssessments)
              .where(eq(clientControlAssessments.clientId, engagement.clientId))
          : [];
      const assessByControl = new Map(
        allAssessments.map((a) => [a.controlId, a]),
      );

      applicableStandards = rolled.map((r) => {
        const leaves = allControls.filter(
          (c) => c.standardId === r.standard.id && c.parentId !== null,
        );
        const openGaps = leaves
          .map((c) => {
            const a = assessByControl.get(c.id);
            const status = a?.status ?? "unknown";
            return {
              status,
              code: c.code,
              title: c.title,
              guidance: c.guidance,
              evidence: a?.evidence ?? null,
            };
          })
          .filter(
            (g) =>
              g.status === "non_compliant" ||
              g.status === "partial" ||
              g.status === "unknown",
          );
        return {
          scope: "buyer-client" as const,
          name: r.standard.name,
          version: r.standard.version,
          source: r.standard.source,
          isRequired: r.isRequired,
          inheritedFromGroup:
            r.source === "inherited" && r.standard.ownershipGroupId
              ? groupNameById.get(r.standard.ownershipGroupId) ?? null
              : null,
          rationale: r.rationale,
          rollup: r.rollup,
          openGaps,
        };
      });
    }

    // --- Engagement-level applicable standards + assessments ----------
    // The target's posture as discovered during this engagement. These
    // win over buyer-client entries when the same standard appears on
    // both — the briefing is about the TARGET, so the target's data is
    // primary.
    const {
      diligenceEngagementApplicableStandards,
      diligenceEngagementControlAssessments,
      standards: standardsTable,
      standardControls: standardControlsTable2,
    } = await import("@/db/schema");
    const engAppRows = await db
      .select({
        standard: standardsTable,
        isRequired: diligenceEngagementApplicableStandards.isRequired,
        rationale: diligenceEngagementApplicableStandards.rationale,
      })
      .from(diligenceEngagementApplicableStandards)
      .innerJoin(
        standardsTable,
        eq(diligenceEngagementApplicableStandards.standardId, standardsTable.id),
      )
      .where(
        and(
          eq(
            diligenceEngagementApplicableStandards.engagementId,
            engagementId,
          ),
          eq(
            diligenceEngagementApplicableStandards.organizationId,
            organizationId,
          ),
        ),
      );

    if (engAppRows.length > 0) {
      const engStandardIds = engAppRows.map((r) => r.standard.id);
      const { inArray } = await import("drizzle-orm");
      const engControls = await db
        .select()
        .from(standardControlsTable2)
        .where(inArray(standardControlsTable2.standardId, engStandardIds));
      const engAssessments = await db
        .select()
        .from(diligenceEngagementControlAssessments)
        .where(
          eq(
            diligenceEngagementControlAssessments.engagementId,
            engagementId,
          ),
        );
      const engAssessByControl = new Map(
        engAssessments.map((a) => [a.controlId, a]),
      );

      const engEntries = engAppRows.map((r) => {
        const leaves = engControls.filter(
          (c) => c.standardId === r.standard.id && c.parentId !== null,
        );
        let compliant = 0,
          partial = 0,
          nonCompliant = 0,
          notApplicable = 0,
          unknown = 0;
        const openGaps: Array<{
          code: string | null;
          title: string;
          status: string;
          guidance: string | null;
          evidence: string | null;
        }> = [];
        for (const l of leaves) {
          const a = engAssessByControl.get(l.id);
          const status = a?.status ?? "unknown";
          if (status === "compliant") compliant++;
          else if (status === "partial") partial++;
          else if (status === "non_compliant") nonCompliant++;
          else if (status === "not_applicable") notApplicable++;
          else unknown++;
          if (
            status === "non_compliant" ||
            status === "partial" ||
            status === "unknown"
          ) {
            openGaps.push({
              code: l.code,
              title: l.title,
              status,
              guidance: l.guidance,
              evidence: a?.evidence ?? null,
            });
          }
        }
        return {
          scope: "engagement" as const,
          name: r.standard.name,
          version: r.standard.version,
          source: r.standard.source,
          isRequired: !!r.isRequired,
          inheritedFromGroup: null,
          rationale: r.rationale,
          rollup: {
            total: leaves.length,
            compliant,
            partial,
            nonCompliant,
            notApplicable,
            unknown,
          },
          openGaps,
        };
      });

      // Engagement entries override buyer-client entries by name match.
      // Otherwise both go in.
      const engNames = new Set(engEntries.map((e) => e.name));
      const filteredBuyer = (applicableStandards ?? []).filter(
        (b) => !engNames.has(b.name),
      );
      applicableStandards = [...engEntries, ...filteredBuyer];
    }

    const [findings, costLines, artifacts, sessions] = await Promise.all([
      db
        .select()
        .from(diligenceFindings)
        .where(eq(diligenceFindings.engagementId, engagementId))
        .orderBy(asc(diligenceFindings.refCode)),
      db
        .select()
        .from(diligenceCostLines)
        .where(eq(diligenceCostLines.engagementId, engagementId))
        .orderBy(asc(diligenceCostLines.position)),
      db
        .select()
        .from(diligenceArtifacts)
        .where(eq(diligenceArtifacts.engagementId, engagementId))
        .orderBy(asc(diligenceArtifacts.title)),
      db
        .select()
        .from(diligenceSessions)
        .where(eq(diligenceSessions.engagementId, engagementId))
        .orderBy(asc(diligenceSessions.scheduledAt)),
    ]);

    context.findings = findings.map((f) => ({
      refCode: f.refCode,
      severity: f.severity as "low" | "medium" | "high" | "critical" | "info",
      status: f.status,
      immediate: f.immediate,
      title: f.title,
      narrative: f.narrative,
    }));
    context.costLines = costLines.map((c) => ({
      workItem: c.workItem,
      lowCents: c.lowCents,
      highCents: c.highCents,
      recurring: c.recurring,
      timing: c.timing,
      category: c.category,
      notes: c.notes,
      findingId: c.findingId ?? null,
      costType: c.costType ?? null,
    }));
    context.artifacts = artifacts.map((a) => ({
      kind: a.kind,
      title: a.title,
      summary: a.summary,
      riskLevel: a.riskLevel,
      needsAttention: a.needsAttention,
      notes: a.notes,
    }));
    context.sessions = sessions.map((s) => ({
      title: s.title,
      scheduledAt: s.scheduledAt,
      mode: s.mode,
      summary: s.summary,
    }));
    if (applicableStandards && applicableStandards.length > 0) {
      context.applicableStandards = applicableStandards;
    }
  }

  return { context, questions };
}
