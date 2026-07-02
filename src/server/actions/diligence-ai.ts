"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AI_MODEL,
  buildSystemPrompt,
  getAnthropic,
  loadEngagementContext,
  type BriefingDraft,
  type ExtractedAnswer,
  type SuggestedQuestion,
} from "@/lib/ai/anthropic";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

/* ============================================================================
 * Shared output schemas — used as JSON Schema constraints on Claude.
 * ========================================================================== */

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionKey", "value", "evidence", "confidence"],
        properties: {
          questionKey: { type: "string" },
          value: {
            // mixed-type — allow string, number, boolean, string[], or null
            anyOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { type: "array", items: { type: "string" } },
              { type: "null" },
            ],
          },
          evidence: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    notesAboutSession: { type: "string" },
  },
  required: ["proposals", "notesAboutSession"],
} as const;

const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionKey", "rationale", "framingHint"],
        properties: {
          questionKey: { type: "string" },
          rationale: { type: "string" },
          framingHint: { type: "string" },
        },
      },
    },
  },
} as const;

const BRIEFING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "sections",
    "topRisks",
    "topOpportunities",
    "hundredDayPlan",
  ],
  properties: {
    executiveSummary: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body", "riskRating"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
          riskRating: {
            type: "string",
            enum: ["info", "low", "medium", "high", "critical"],
          },
        },
      },
    },
    topRisks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "narrative"],
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          narrative: { type: "string" },
        },
      },
    },
    topOpportunities: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "narrative"],
        properties: {
          title: { type: "string" },
          narrative: { type: "string" },
        },
      },
    },
    hundredDayPlan: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
  },
} as const;

/* ============================================================================
 * 1. extractAnswersFromNotes
 * Given raw interview notes, returns a list of proposed answers per
 * question key, each with an evidence quote and a confidence rating.
 * The user reviews proposals on the client and accepts the ones they
 * agree with — nothing persists from this call.
 * ========================================================================== */
const extractSchema = z.object({
  engagementId: z.string().uuid(),
  notes: z.string().min(10).max(60_000),
  /** Optional: scope extraction to a known session for provenance only. */
  sessionId: z.string().uuid().optional().nullable(),
});

export const extractAnswersFromNotes = authedAction
  .schema(extractSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");

    const { context, questions } = await loadEngagementContext(
      parsedInput.engagementId,
      ctx.organization.id,
    );
    const validKeys = new Set(questions.map((q) => q.key));

    const client = getAnthropic();
    const result = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: EXTRACT_SCHEMA },
      },
      system: buildSystemPrompt(questions, context),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `# Task: Extract structured answers from these interview notes

For each question in the catalog where the notes contain a direct or strongly-implied answer, return a proposal with:
- questionKey from the catalog (must match exactly — proposals with unknown keys will be discarded)
- value matching the question kind:
    text/longtext -> string
    yes_no -> boolean
    number -> number (in the unit the question specifies)
    select -> string from options
    multiselect -> string[] from options
- evidence: a verbatim quote from the notes that supports the value
- confidence: high (explicit answer), medium (clear inference), low (ambiguous — interviewer should review)

Skip questions the notes don't address. Don't fabricate. If the notes contradict an existing satisfactory answer, still emit a proposal so the interviewer can reconcile.

Also include a short "notesAboutSession" — 1-2 sentences flagging anything notable for the interviewer (e.g. topics raised that aren't in the catalog, contradictions, hot leads to chase).

# Interview notes

${parsedInput.notes}`,
            },
          ],
        },
      ],
    });

    // parsed_output isn't typed in current SDK for messages.create — we
    // pull the JSON out of the first text block which is the schema-shaped
    // response.
    const text = result.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new PublicError("AI did not return a parseable response");
    }
    let parsed: { proposals: ExtractedAnswer[]; notesAboutSession: string };
    try {
      const raw = text.text.trim();
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s === -1 || e <= s) throw new Error("no JSON object");
      parsed = JSON.parse(raw.slice(s, e + 1));
    } catch {
      throw new PublicError("AI response was not valid JSON");
    }

    // Drop proposals with question keys that aren't in the active catalog.
    const proposals = parsed.proposals.filter((p) => validKeys.has(p.questionKey));

    return {
      proposals,
      notesAboutSession: parsed.notesAboutSession ?? "",
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: result.usage.cache_creation_input_tokens ?? 0,
      },
    };
  });

/* ============================================================================
 * 2. suggestNextQuestions
 * Looks at unanswered + unsatisfactory questions and proposes the top N
 * to chase next, with a rationale and a framing hint for the interviewer.
 * ========================================================================== */
const suggestSchema = z.object({
  engagementId: z.string().uuid(),
  count: z.number().int().min(1).max(10).default(5),
});

export const suggestNextQuestions = authedAction
  .schema(suggestSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("read", "diligence");

    const { context, questions } = await loadEngagementContext(
      parsedInput.engagementId,
      ctx.organization.id,
    );
    const answeredKeys = new Set(
      context.responses.filter((r) => r.satisfactory).map((r) => r.questionKey),
    );
    const openQuestions = questions.filter((q) => !answeredKeys.has(q.key));

    if (openQuestions.length === 0) {
      return { suggestions: [], usage: null };
    }

    const client = getAnthropic();
    const result = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SUGGEST_SCHEMA },
      },
      system: buildSystemPrompt(questions, context),
      messages: [
        {
          role: "user",
          content: `Identify the ${parsedInput.count} highest-leverage questions to chase next given the engagement state above.

Prioritize by:
1. Risk and material spend exposure (security, compliance, identity, vendor lock-in, big-ticket renewals)
2. Lead-to-cash and industry-specific tooling that drive revenue
3. Topics where existing answers reveal a gap or contradiction
4. Foundational questions that unlock several follow-ups

Return ${parsedInput.count} suggestions, each with:
- questionKey from the catalog
- rationale (why this matters now, 1-2 sentences)
- framingHint (a coaching tip — how to ask it so the answer is concrete)

Only suggest questions that aren't already marked satisfactory.`,
        },
      ],
    });

    const text = result.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new PublicError("AI did not return a parseable response");
    }
    let parsed: { suggestions: SuggestedQuestion[] };
    try {
      const raw = text.text.trim();
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s === -1 || e <= s) throw new Error("no JSON object");
      parsed = JSON.parse(raw.slice(s, e + 1));
    } catch {
      throw new PublicError("AI response was not valid JSON");
    }
    const validKeys = new Set(openQuestions.map((q) => q.key));
    const suggestions = parsed.suggestions.filter((s) => validKeys.has(s.questionKey));

    return {
      suggestions,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0,
      },
    };
  });

/* ============================================================================
 * 3. generateBriefingDraft
 * Produces an executive briefing document JSON from collected responses.
 * Saves a new row in diligence_briefings so the user can iterate.
 * ========================================================================== */
const briefingSchema = z.object({
  engagementId: z.string().uuid(),
});

export const generateBriefingDraft = authedAction
  .schema(briefingSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");

    const { context, questions } = await loadEngagementContext(
      parsedInput.engagementId,
      ctx.organization.id,
      { includeFull: true },
    );

    if (context.responses.length === 0) {
      throw new PublicError(
        "Briefing draft needs answered questions to work from. Capture some responses in the questionnaire first.",
      );
    }

    // Wrap the AI call so we can give the operator a useful error message
    // instead of next-safe-action's generic "Something went wrong" mask.
    // Anthropic.APIError subclasses carry status + message; everything else
    // gets a generic prefix but still keeps the underlying detail.
    // The SDK requires streaming for any call whose total token budget
    // could realistically push past the 10-minute synchronous ceiling.
    // With 32k max_tokens + adaptive thinking + max effort + a json-schema
    // constraint, this one tripped the guard. `.stream(...).finalMessage()`
    // returns the same `Message` shape as create() once the response is
    // fully assembled — the rest of the code below works unchanged.
    const client = getAnthropic();
    let result;
    try {
      result = await client.messages
        .stream({
          model: AI_MODEL,
          // Using streaming, so the SDK's 21,333-token guard doesn't apply.
          // 32k gives comfortable headroom for 6+ sections across all 5 tracks.
          max_tokens: 32000,
          thinking: { type: "adaptive" },
        output_config: {
          effort: "high",
          format: { type: "json_schema", schema: BRIEFING_SCHEMA },
        },
        system: buildSystemPrompt(questions, context),
        messages: [
        {
          role: "user",
          content: `Produce a substantive, deal-sponsor-grade M&A diligence executive briefing for this engagement. The reader is a private-equity / family-office sponsor evaluating an acquisition. They need a clear picture across ALL five diligence tracks — IT, Legal, Finance, Facilities, and HR — with a frank assessment of what's good, what's concerning, and what's a potential deal risk.

This is a DRAFT. Produce the most informative briefing possible from the evidence available — do not refuse because evidence is incomplete. Treat both SATISFACTORY and DRAFT responses as legitimate inputs (drafts come from inventories or document extraction and are factual, just unverified). When a fact is from a draft response or inferred, say so plainly ("Per the provided org chart...") rather than omitting it.

ASSESSMENT FRAMEWORK — for each response collected, determine:
- GOOD: Findings that de-risk the deal, demonstrate operational maturity, or represent genuine strengths.
- BAD: Areas of concern that require attention, negotiation, or post-close remediation.
- UGLY: Critical risks — deal-structure, valuation, or go/no-go factors — that could materially affect the transaction.

Output structure (schema enforces minimums — every field must be substantive):

- executiveSummary: 4-6 sentences. What does the target do? What's the deal thesis at a glance? What is the single most important headline finding across all five tracks — the one thing a sponsor must know before proceeding?

- sections: AT LEAST six sections, one per major area. Cover all five tracks. Required section types:
  * IT: Infrastructure, End User Computing, Identity & Access, Security, Backup & DR, Applications, Compliance
  * Legal: Corporate structure, key contracts, IP ownership, litigation exposure, regulatory status
  * Finance: Revenue quality and ARR/MRR, EBITDA quality, debt/liabilities, cash conversion, working capital
  * Facilities: Real property, lease terms and obligations, building condition, CapEx requirements
  * HR: Headcount and key person dependencies, compensation vs. market, benefits obligations, retention risk, culture

  For each section: 2-5 paragraphs of concrete narrative organized as GOOD (strengths), BAD (concerns), UGLY (critical risks). Cite specific evidence (vendor names, numbers, dates, dollar amounts). If a track has no data collected, write the section as "No data collected for [Track] — open questions for next session" but still include it.

- topRisks: 3-7 entries ranked critical → low across ALL tracks. Each must be a concrete, named risk: what's exposed, what's the impact on deal value or structure, and what would remediate it. No vague entries — name the system, contract, person, or liability.

- topOpportunities: 3-5 entries. Concrete value-creation opportunities post-close: cost synergies, revenue acceleration, capability gaps the acquirer can fill, consolidation plays.

- hundredDayPlan: 5-10 ordered work items across all tracks. Phrased as do-by-when imperatives: "Within 30 days: complete IT security assessment and pen test" / "By day 60: renegotiate top 3 customer contracts to remove change-of-control clauses". Sequence so dependencies make sense.

When evidence is missing on a topic, include the section with a note like "No Legal data collected — key open questions are: [list]." Don't drop sections.

If compliance standards are present in the engagement context, weight the IT and Legal sections toward those frameworks. For REQUIRED standards, call out the specific open gaps by name and incorporate closing them into the 100-day plan.

FINANCIAL IMPACT ASSESSMENT INSTRUCTIONS:
- The engagement context includes a "Remediation Cost Lines" section with explicitly entered costs (low and high estimates, cost type, timing). Use these as authoritative figures.
- For findings WITH explicit cost lines: report the HIGH-END figures verbatim. Never average or use the low estimate. Include cost breakdown by type (labor, hardware, software, SOW, etc.) where data is available.
- For findings WITHOUT explicit cost lines: estimate remediation costs based on industry-standard M&A diligence experience. Bias ALL estimates to the HIGH end — these are conservative estimates for the acquirer, not comfortable targets. Use these benchmarks:
    * External IT consultants / engineers: $175–$250/hr
    * Project management: $125–$175/hr
    * Internal labor (IT staff redeployment): $80–$120/hr
    * Hardware refresh: use current market list prices, add 15% for installation/integration
    * Enterprise SaaS licensing: annual contract value + 20% for implementation and training
    * Professional services / SOW engagements: add 25% contingency over baseline estimate
    * Multi-site work: add 20% for travel and coordination overhead
    * All labor and professional services: add 25% for taxes, benefits, and overhead burden
- Round all estimates to the nearest $500. Never present a range wider than 2× (e.g., $10k–$20k acceptable; $5k–$50k is not — tighten the range).
- In the executiveSummary: include one concrete sentence summarizing total estimated remediation investment (one-time + annual recurring where applicable).
- In each section narrative: where findings are present, conclude with a cost estimate paragraph.
- In topRisks: include an estimated remediation cost in the narrative for each risk entry.
- In hundredDayPlan: include a cost estimate for each line item where remediation spending is required.`,
            },
          ],
        })
        .finalMessage();
    } catch (err) {
      // Log full error server-side so Vercel logs still have detail.
      console.error("generateBriefingDraft: AI call failed", err);
      // Anthropic SDK errors carry a status + message; surface both so the
      // operator knows whether it was rate-limit / bad request / server.
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown AI error";
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      throw new PublicError(
        status
          ? `AI call failed (HTTP ${status}): ${msg}`
          : `AI call failed: ${msg}`,
      );
    }

    const text = result.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new PublicError(
        `AI returned no text block (stop_reason: ${result.stop_reason ?? "unknown"}). Try again or shorten the engagement evidence.`,
      );
    }
    let draft: BriefingDraft;
    try {
      const raw = text.text.trim();
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s === -1 || e <= s) throw new Error("no JSON object");
      draft = JSON.parse(raw.slice(s, e + 1));
    } catch {
      // Common cause: AI exceeded max_tokens mid-JSON and the response was
      // truncated. Surface stop_reason so the operator knows whether to
      // retry vs trim evidence.
      throw new PublicError(
        `AI response was not valid JSON (stop_reason: ${result.stop_reason ?? "unknown"}). If stop_reason is "max_tokens", the briefing was too long — try again.`,
      );
    }

    // Persist as a new briefing version so the user can iterate.
    const { db } = await import("@/db");
    const { diligenceBriefings } = await import("@/db/schema");
    const { eq, sql } = await import("drizzle-orm");

    let created;
    try {
      const [versionRow] = await db
        .select({
          max: sql<number>`coalesce(max(${diligenceBriefings.version}), 0)`,
        })
        .from(diligenceBriefings)
        .where(eq(diligenceBriefings.engagementId, parsedInput.engagementId));
      const nextVersion = (versionRow?.max ?? 0) + 1;

      [created] = await db
        .insert(diligenceBriefings)
        .values({
          organizationId: ctx.organization.id,
          engagementId: parsedInput.engagementId,
          version: nextVersion,
          generatedByMembershipId: ctx.membership.id,
          contentJson: draft as unknown as Record<string, unknown>,
        })
        .returning();
    } catch (err) {
      console.error("generateBriefingDraft: DB insert failed", err);
      const msg = err instanceof Error ? err.message : "unknown DB error";
      throw new PublicError(`Saved AI draft but DB write failed: ${msg}`);
    }

    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    revalidatePath(`/diligence/${parsedInput.engagementId}/briefing`);

    return {
      briefingId: created.id,
      version: created.version,
      draft,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: result.usage.cache_creation_input_tokens ?? 0,
      },
    };
  });
