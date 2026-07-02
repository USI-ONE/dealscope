/**
 * GET /clients/[id]/compliance/[standardId]/export.docx
 *
 * Streams a DOCX gap report — the kind of thing you'd email to a client
 * stakeholder showing where they stand against a standard and what to
 * close.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clientControlAssessments,
  clients,
  standardControls,
  standards,
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

  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) return new Response("Client not found", { status: 404 });

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
      .from(clientControlAssessments)
      .where(
        and(
          eq(clientControlAssessments.clientId, client.id),
          eq(clientControlAssessments.organizationId, ctx.organization.id),
        ),
      ),
  ]);

  const buf = await buildGapReportDocx({
    client: { name: client.name },
    standard,
    controls,
    assessments,
    preparedByName: ctx.user.name ?? ctx.user.email ?? null,
  });

  const filename = `${slugify(client.name)}-${slugify(standard.name)}-gap-${new Date().toISOString().slice(0, 10)}.docx`;

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
