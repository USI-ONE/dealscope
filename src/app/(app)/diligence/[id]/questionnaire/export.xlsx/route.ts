/**
 * GET /diligence/[id]/questionnaire/export.xlsx
 *
 * Streams an XLSX of the engagement's IT questionnaire — every question for
 * the selected industry, with any existing answers pre-populated.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  diligenceEngagementResponses,
  diligenceEngagements,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { INDUSTRY_LABELS } from "@/lib/diligence/industries";
import { getQuestionsForIndustry } from "@/lib/diligence/question-library";
import {
  buildWorksheet,
  type ExistingResponse,
  type WorksheetMeta,
} from "@/lib/diligence/worksheet";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctxArg: { params: Promise<{ id: string }> },
) {
  const { id } = await ctxArg.params;
  const ctx = await requireContext();

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) {
    return new Response("Engagement not found", { status: 404 });
  }

  const responseRows = await db
    .select({
      questionKey: diligenceEngagementResponses.questionKey,
      value: diligenceEngagementResponses.value,
      satisfactory: diligenceEngagementResponses.satisfactory,
      notes: diligenceEngagementResponses.notes,
    })
    .from(diligenceEngagementResponses)
    .where(eq(diligenceEngagementResponses.engagementId, engagement.id));

  const questions = getQuestionsForIndustry(engagement.industry ?? null);
  const responses: ExistingResponse[] = responseRows.map((r) => ({
    questionKey: r.questionKey,
    value: r.value,
    satisfactory: r.satisfactory,
    notes: r.notes,
  }));

  const meta: WorksheetMeta = {
    engagementId: engagement.id,
    targetCompanyName: engagement.targetCompanyName,
    industryLabel: engagement.industry
      ? INDUSTRY_LABELS[engagement.industry]
      : null,
    preparedBy: ctx.user.name ?? ctx.user.email ?? "DealScope",
    preparedFor: null,
    generatedAt: new Date().toISOString().slice(0, 10),
  };

  const bytes = await buildWorksheet(meta, questions, responses);

  const slug =
    slugify(engagement.targetCompanyName) || `engagement-${engagement.id.slice(0, 8)}`;
  const filename = `dealscope-questionnaire-${slug}.xlsx`;

  const body = new Uint8Array(bytes).buffer;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
