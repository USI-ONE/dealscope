/**
 * POST /diligence/[id]/questionnaire/import
 *
 * Accepts a multipart upload of a previously-exported questionnaire
 * worksheet (with the customer / third party's answers filled in),
 * parses each row, and upserts responses against the engagement.
 *
 * Returns JSON the UI can render directly:
 *   {
 *     ok: true,
 *     persisted: <count>,
 *     unanswered: <count>,        // rows the recipient left blank
 *     parseFailures: [...],       // rows we couldn't normalize
 *     unknownKeys: [...],         // keys not in the current library
 *   }
 *
 * The upsert mirrors `setEngagementResponse` but is inlined to avoid
 * round-tripping safe-action validation on potentially hundreds of rows.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  diligenceEngagementResponses,
  diligenceEngagements,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { getQuestionsForIndustry } from "@/lib/diligence/question-library";
import {
  parseWorksheet,
  type ParsedRow,
} from "@/lib/diligence/worksheet";

export const runtime = "nodejs";
// XLSX uploads can be big; opt out of the smaller default body limit.
export const maxDuration = 60;

type ImportSummary = {
  ok: true;
  persisted: number;
  unanswered: number;
  parseFailures: Array<{ questionKey: string; rawAnswer: string; issue: string | null }>;
  unknownKeys: string[];
  unchanged: number;
};

export async function POST(
  req: Request,
  ctxArg: { params: Promise<{ id: string }> },
) {
  const { id } = await ctxArg.params;
  const ctx = await requirePermission("update", "diligence");

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) {
    return Response.json({ ok: false, error: "Engagement not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json(
      { ok: false, error: "Expected multipart/form-data with a 'file' field" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "Missing 'file' upload" },
      { status: 400 },
    );
  }

  // Soft size cap to keep memory bounded — server actions / route bodies
  // usually default to ~4MB; allow up to 10MB for big questionnaires.
  if (file.size > 10 * 1024 * 1024) {
    return Response.json(
      { ok: false, error: "File too large (10MB max)" },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  const questions = getQuestionsForIndustry(engagement.industry ?? null);
  const questionsByKey = new Map(questions.map((q) => [q.key, q]));

  let parsed;
  try {
    parsed = await parseWorksheet(arrayBuffer, questionsByKey);
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Could not read the uploaded file as an XLSX worksheet.",
      },
      { status: 400 },
    );
  }

  // Existing responses, so we can avoid no-op writes and report unchanged count.
  const existing = await db
    .select({
      questionKey: diligenceEngagementResponses.questionKey,
      value: diligenceEngagementResponses.value,
      satisfactory: diligenceEngagementResponses.satisfactory,
      notes: diligenceEngagementResponses.notes,
    })
    .from(diligenceEngagementResponses)
    .where(eq(diligenceEngagementResponses.engagementId, engagement.id));
  const existingByKey = new Map(existing.map((e) => [e.questionKey, e]));

  let persisted = 0;
  let unchanged = 0;
  const now = new Date();

  for (const row of parsed.persistable) {
    const prev = existingByKey.get(row.questionKey);
    const sameValue = JSON.stringify(prev?.value ?? null) === JSON.stringify(row.value ?? null);
    const sameSat = (prev?.satisfactory ?? false) === row.satisfactory;
    const sameNotes = (prev?.notes ?? null) === (row.notes ?? null);
    if (prev && sameValue && sameSat && sameNotes) {
      unchanged += 1;
      continue;
    }

    await db
      .insert(diligenceEngagementResponses)
      .values({
        organizationId: ctx.organization.id,
        engagementId: engagement.id,
        questionKey: row.questionKey,
        value: row.value ?? null,
        satisfactory: row.satisfactory,
        notes: row.notes,
        answeredByMembershipId: ctx.membership.id,
        answeredAt: now,
      })
      .onConflictDoUpdate({
        target: [
          diligenceEngagementResponses.engagementId,
          diligenceEngagementResponses.questionKey,
        ],
        set: {
          value: row.value ?? null,
          satisfactory: row.satisfactory,
          notes: row.notes,
          answeredByMembershipId: ctx.membership.id,
          answeredAt: now,
          updatedAt: now,
        },
      });
    persisted += 1;
  }

  revalidatePath(`/diligence/${engagement.id}`);

  const summary: ImportSummary = {
    ok: true,
    persisted,
    unchanged,
    unanswered: parsed.unanswered.length,
    unknownKeys: parsed.unknownKeys,
    parseFailures: parsed.parseFailures.map((r: ParsedRow) => ({
      questionKey: r.questionKey,
      rawAnswer: r.rawAnswer,
      issue: r.issue,
    })),
  };

  return Response.json(summary);
}
