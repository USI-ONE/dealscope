/**
 * Claude-written narrative for client assessments.
 *
 * Grades and findings are computed deterministically (assessment.ts); the
 * model turns them into plain-English business impact, a phased roadmap
 * with generic cost bands, and — across sites — the common issues and a
 * standardization / rollout plan. Output is constrained by a JSON schema
 * and re-validated with zod.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getAnthropic } from "@/lib/ai/anthropic";
import { PublicError } from "@/server/safe-action";
import { AREAS, COSTS, enforceCost, PHASES } from "./assessment";

export const ASSESSMENT_MODEL = "claude-opus-5-5";

const AREA_KEYS = AREAS.map((a) => a.key);

const SYSTEM = `You write client-facing IT site assessments for USI Computer, a managed IT provider, about small branch offices (often 2–10 staff).

Audience: the business owner and leadership — not technicians. Write in plain English, short sentences, no jargon (say "battery backup", not "UPS"; "business-grade firewall", not "NGFW"). Explain every problem as its effect on the business: lost calls, card payments failing, downtime, security exposure, compliance fines, staff frustration.

Be factual and specific to the facts given. Never invent equipment, numbers, dates or prices. Don't mention dollar amounts — cost is only expressed as a band:
  "$"   minor — a few hours of labor or low-cost parts
  "$$"  moderate — new equipment and/or a day or more of labor
  "$$$" major — significant equipment, cabling or a multi-day project

House rule: any work on a camera system (installing, replacing, or moving cameras to a new platform) is always "$$$".

Phases:
  "Fix now"          safety, security or outage risks that should not wait
  "Next 90 days"     important improvements to plan and budget
  "Planned refresh"  modernization that can follow the first two

Only state facts that appear in the input. A high grade means no problems were recorded in that area, not that it was verified to work well — so never call something "solid", "working well" or "in good shape" unless the input says so. Strengths must come from facts in the input (e.g. "fiber internet", "16 working cameras").

Areas marked NOT ASSESSED had too little walk data to grade and are left out of the overall grade. Never describe them as fine or problem-free — say they still need to be checked, and treat filling those gaps as an early roadmap item. If the overall grade is partial, say so plainly in the summary.

Tone: confident, constructive, not alarmist. Credit what is working.`;

const SITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "strengths", "area_impacts", "roadmap"],
  properties: {
    headline: { type: "string", description: "One sentence, under 20 words, the bottom line for this site." },
    summary: { type: "string", description: "Two short paragraphs separated by a blank line." },
    strengths: { type: "array", items: { type: "string" }, description: "0-3 things that are in good shape." },
    area_impacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "impact"],
        properties: {
          area: { type: "string", enum: AREA_KEYS },
          impact: { type: "string", description: "One sentence: what the findings in this area mean for the business." },
        },
      },
    },
    roadmap: {
      type: "array",
      description: "5-12 recommendations that together resolve the findings and risks.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "why", "area", "phase", "cost"],
        properties: {
          title: { type: "string", description: "Action, under 10 words." },
          why: { type: "string", description: "One sentence on the business benefit." },
          area: { type: "string", enum: AREA_KEYS },
          phase: { type: "string", enum: [...PHASES] },
          cost: { type: "string", enum: [...COSTS] },
        },
      },
    },
  },
} as const;

const siteSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  strengths: z.array(z.string()),
  area_impacts: z.array(z.object({ area: z.enum(AREA_KEYS as [string, ...string[]]), impact: z.string() })),
  roadmap: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      area: z.enum(AREA_KEYS as [string, ...string[]]),
      phase: z.enum(PHASES),
      cost: z.enum(COSTS),
    }),
  ),
});
export type SiteNarrative = z.infer<typeof siteSchema>;

const PORTFOLIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "common_issues", "standards", "rollout"],
  properties: {
    headline: { type: "string", description: "One sentence, under 25 words, the bottom line across all sites." },
    summary: { type: "string", description: "Two or three short paragraphs separated by blank lines." },
    common_issues: {
      type: "array",
      description: "3-6 issues that recur across sites, most widespread first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issue", "sites", "recommendation"],
        properties: {
          issue: { type: "string", description: "Short title, under 12 words." },
          sites: { type: "array", items: { type: "string" }, description: "Exact site names from the input." },
          recommendation: { type: "string", description: "What the issue means and what to do — 1-3 sentences, include the phase and cost band." },
        },
      },
    },
    standards: {
      type: "array",
      description: "3-6 company-wide standards to adopt so every branch runs the same way.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "standard", "why"],
        properties: {
          area: { type: "string", enum: AREA_KEYS },
          standard: { type: "string" },
          why: { type: "string" },
        },
      },
    },
    rollout: {
      type: "array",
      description: "Every site exactly once, in the recommended order to remediate.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["site", "why"],
        properties: { site: { type: "string" }, why: { type: "string", description: "One sentence." } },
      },
    },
  },
} as const;

const portfolioSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  common_issues: z.array(z.object({ issue: z.string(), sites: z.array(z.string()), recommendation: z.string() })),
  standards: z.array(z.object({ area: z.enum(AREA_KEYS as [string, ...string[]]), standard: z.string(), why: z.string() })),
  rollout: z.array(z.object({ site: z.string(), why: z.string() })),
});
export type PortfolioNarrative = z.infer<typeof portfolioSchema>;

async function run<T>(schema: object, validator: z.ZodType<T>, prompt: string): Promise<T> {
  const client = getAnthropic();
  // `fallbacks` isn't in this SDK version's types yet; it's a documented
  // request field, so pass it through with the beta header.
  const params = {
    model: ASSESSMENT_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming;

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.stream(params).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new PublicError("AI is busy right now — try again in a minute.");
    if (err instanceof Anthropic.APIError) throw new PublicError(`AI request failed (${err.status ?? "network"}). Try again.`);
    throw err;
  }
  if (message.stop_reason === "refusal") throw new PublicError("The AI declined to write this report.");
  if (message.stop_reason === "max_tokens") throw new PublicError("The report ran too long — try again.");

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return validator.parse(JSON.parse(text));
  } catch {
    throw new PublicError("The AI returned an unreadable report. Try again.");
  }
}

export async function writeSiteNarrative(facts: string) {
  const n = await run(
    SITE_SCHEMA,
    siteSchema,
    `Write the client assessment for this site from the walk findings below. Area keys: ${AREAS.map((a) => `${a.key} = ${a.title}`).join(", ")}. Give an area_impacts entry only for areas that have findings.\n\n${facts}`,
  );
  return { ...n, roadmap: n.roadmap.map((r) => enforceCost(r)) };
}

export function writePortfolioNarrative(customer: string, sitesFacts: string) {
  return run(
    PORTFOLIO_SCHEMA,
    portfolioSchema,
    `Write the multi-site portfolio summary for ${customer || "this client"} from the per-site results below. Focus on what is common across branches and on standardizing so every branch runs on the same platform and can be managed and viewed centrally. Area keys: ${AREAS.map((a) => `${a.key} = ${a.title}`).join(", ")}.\n\n${sitesFacts}`,
  );
}
