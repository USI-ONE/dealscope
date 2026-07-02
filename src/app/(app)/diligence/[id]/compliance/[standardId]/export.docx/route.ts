/**
 * GET /diligence/[id]/compliance/[standardId]/export.docx
 *
 * Streams a DOCX gap report for a diligence engagement against a chosen
 * standard. Same shape as the client-side gap report — cover, summary
 * KV, per-domain control table, open-gaps section.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  diligenceEngagementControlAssessments,
  diligenceEngagements,
  standardControls,
  standards,
  type ClientControlAssessment,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { buildGapReportDocx } from "@/lib/compliance/docx-builder";

export const runtime = "nodejs";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(
  _req: Request,
  ctxArg: { params: Promise<{ id: string; standardId: string }> },
) {
  const { id, standardId } = await ctxArg.params;
  const ctx = await requireContext();

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) return new Response("Engagement not found", { status: 404 });

  const standard = await db.query.standards.findFirst({
    where: and(
      eq(standards.id, standardId),
      eq(standards.organizationId, ctx.organization.id),
    ),
  });
  if (!standard) return new Response("Standard not found", { status: 404 });

  const [controls, assessments] = await Promise.all([
    db
      .select()
      .from(standardControls)
      .where(eq(standardControls.standardId, standard.id))
      .orderBy(asc(standardControls.position)),
    db
      .select()
      .from(diligenceEngagementControlAssessments)
      .where(
        and(
          eq(diligenceEngagementControlAssessments.engagementId, engagement.id),
          eq(
            diligenceEngagementControlAssessments.organizationId,
            ctx.organization.id,
          ),
        ),
      ),
  ]);

  // The DOCX builder expects ClientControlAssessment-shaped rows. The
  // engagement-side row has the same fields except for clientId — we
  // adapt by stamping a synthetic clientId so the builder is reused
  // without modification. The field is never read in the builder itself.
  const adaptedAssessments: ClientControlAssessment[] = assessments.map(
    (a) =>
      ({
        ...a,
        clientId: engagement.id, // unused by builder
      }) as unknown as ClientControlAssessment,
  );

  const buf = await buildGapReportDocx({
    client: { name: engagement.targetCompanyName },
    standard,
    controls,
    assessments: adaptedAssessments,
    preparedByName: ctx.user.name ?? ctx.user.email ?? null,
  });

  const filename = `${slugify(engagement.targetCompanyName)}-${slugify(standard.name)}-gap-${new Date().toISOString().slice(0, 10)}.docx`;

  return new Response(new Uint8Array(buf).buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
