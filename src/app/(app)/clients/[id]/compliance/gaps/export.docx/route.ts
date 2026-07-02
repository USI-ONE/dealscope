/**
 * GET /clients/[id]/compliance/gaps/export.docx
 *
 * Consolidated gap report DOCX covering every applicable standard.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import {
  loadConsolidatedGaps,
  tallyGapStats,
} from "@/lib/compliance/gaps";
import { buildConsolidatedGapDocx } from "@/lib/compliance/consolidated-docx-builder";

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
  ctxArg: { params: Promise<{ id: string }> },
) {
  const { id } = await ctxArg.params;
  const ctx = await requireContext();

  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) return new Response("Client not found", { status: 404 });

  const groups = await loadConsolidatedGaps(client.id, ctx.organization.id);
  const stats = tallyGapStats(groups);

  const buf = await buildConsolidatedGapDocx({
    clientName: client.name,
    groups,
    preparedByName: ctx.user.name ?? ctx.user.email ?? null,
    stats,
  });

  const filename = `${slugify(client.name)}-gap-report-${new Date().toISOString().slice(0, 10)}.docx`;

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
