import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  diligenceEngagements,
  diligenceEngagementResponses,
  diligenceSessions,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { getQuestionsForIndustry } from "@/lib/diligence/question-library";
import { ALL_MA_QUESTIONS } from "@/lib/diligence/ma-question-library";
import { getAnthropic, AI_MODEL } from "@/lib/ai/anthropic";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  if (!session.transcriptText) {
    return NextResponse.json({ error: "no_transcript" }, { status: 400 });
  }

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: eq(diligenceEngagements.id, session.engagementId),
    columns: { industry: true },
  });

  const itQuestions = getQuestionsForIndustry(engagement?.industry ?? null);
  const allQuestions = [...itQuestions, ...ALL_MA_QUESTIONS];
  const qList = allQuestions.map((q) => ({
    key: q.key,
    text: q.text,
    kind: q.kind,
    ...(q.options ? { options: q.options } : {}),
  }));

  const client = getAnthropic();
  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    system: `You are a diligence analyst extracting structured answers from an interview transcript.
Return ONLY a JSON array of objects with shape: {"questionKey": string, "value": any, "confidence": "high"|"medium"|"low"}.
- Only include questions where you found a clear answer in the transcript.
- For yes_no questions, value must be true or false (boolean).
- For number questions, value must be a number.
- For select/multiselect, value must match one of the provided options exactly.
- For text/longtext, value is a string summarizing the relevant answer.
- Skip questions where confidence would be "low".
- Return an empty array [] if nothing was found.
Output ONLY the JSON array, no explanation, no markdown fences.`,
    messages: [
      {
        role: "user",
        content: `QUESTION CATALOG (${qList.length} questions):
${JSON.stringify(qList, null, 2)}

TRANSCRIPT:
${session.transcriptText}

Extract all answers with medium or high confidence. Return JSON array only.`,
      },
    ],
  });

  let extracted: Array<{ questionKey: string; value: unknown; confidence: string }> = [];
  const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const startIdx = raw.indexOf("[");
    const endIdx = raw.lastIndexOf("]");
    if (startIdx !== -1 && endIdx !== -1) {
      const parsed = JSON.parse(raw.slice(startIdx, endIdx + 1));
      if (Array.isArray(parsed)) extracted = parsed;
    }
  } catch {
    // Non-JSON response — proceed with 0 extractions
  }

  const toWrite = extracted.filter(
    (e) => e.confidence !== "low" && e.questionKey && e.value !== undefined,
  );

  for (const item of toWrite) {
    await db
      .insert(diligenceEngagementResponses)
      .values({
        organizationId: ctx.organization.id,
        engagementId: session.engagementId,
        questionKey: item.questionKey,
        value: item.value,
        satisfactory: item.confidence === "high",
        answeredByMembershipId: ctx.membership.id,
        answeredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          diligenceEngagementResponses.engagementId,
          diligenceEngagementResponses.questionKey,
        ],
        set: {
          value: item.value,
          satisfactory: item.confidence === "high",
          answeredByMembershipId: ctx.membership.id,
          answeredAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  await db
    .update(diligenceSessions)
    .set({ transcriptStatus: "done" })
    .where(eq(diligenceSessions.id, sid));

  return NextResponse.json({ count: toWrite.length, answers: toWrite });
}
