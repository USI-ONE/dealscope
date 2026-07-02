import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diligenceEngagementResponses, diligenceSessions } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { getQuestionsForIndustry } from "@/lib/diligence/question-library";
import { ALL_MA_QUESTIONS } from "@/lib/diligence/ma-question-library";
import { getAnthropic, AI_MODEL } from "@/lib/ai/anthropic";
import { diligenceEngagements } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ notes: z.string().max(40_000) });

export type Suggestion = {
  questionKey: string;
  questionText: string;
  framing: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const ctx = await requireContext();
  const { sid } = await params;

  const session = await db.query.diligenceSessions.findFirst({
    where: and(
      eq(diligenceSessions.id, sid),
      eq(diligenceSessions.organizationId, ctx.organization.id),
    ),
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { notes } = parsed.data;

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: eq(diligenceEngagements.id, session.engagementId),
    columns: { industry: true, targetCompanyName: true },
  });

  // Which questions are already answered for this engagement?
  const answered = await db
    .select({ questionKey: diligenceEngagementResponses.questionKey })
    .from(diligenceEngagementResponses)
    .where(eq(diligenceEngagementResponses.engagementId, session.engagementId));
  const answeredKeys = new Set(answered.map((r) => r.questionKey));

  const allQuestions = [
    ...getQuestionsForIndustry(engagement?.industry ?? null),
    ...ALL_MA_QUESTIONS,
  ];
  const unanswered = allQuestions
    .filter((q) => !answeredKeys.has(q.key))
    .map((q) => ({ key: q.key, text: q.text, category: q.category }));

  const client = getAnthropic();
  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: `You are a real-time diligence interview coach. Given the interviewer's live notes and a list of unanswered questions, identify the 4 most valuable questions to ask next.

Rules:
- Only suggest questions from the unanswered list (use their exact key).
- Pick questions whose answers are most likely to be available right now given the conversation direction.
- Prefer questions that follow naturally from what's already been discussed.
- The "framing" field is a short, natural conversational phrasing the interviewer can say verbatim — keep it under 20 words.
- Return ONLY a JSON array, no markdown, no explanation.
- Shape: [{"questionKey":"...","questionText":"...","framing":"..."}]
- Return [] if notes are too short to suggest anything meaningful (under 3 sentences).`,
    messages: [
      {
        role: "user",
        content: `TARGET: ${engagement?.targetCompanyName ?? "Unknown"}

LIVE NOTES SO FAR:
${notes || "(none yet)"}

UNANSWERED QUESTIONS (${unanswered.length} remaining):
${JSON.stringify(unanswered.slice(0, 120), null, 2)}

Return the 4 best follow-up questions as a JSON array.`,
      },
    ],
  });

  let suggestions: Suggestion[] = [];
  const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) suggestions = parsed.slice(0, 4);
    }
  } catch {
    // return empty on parse failure
  }

  return NextResponse.json({ suggestions });
}
