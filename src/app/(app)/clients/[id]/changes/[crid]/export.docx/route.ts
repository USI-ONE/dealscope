/**
 * GET /clients/[id]/changes/[crid]/export.docx
 *
 * Streams a CCB-ready DOCX. The returned filename uses the ref code so
 * downloads end up named like "CR-2026-001-shelton-collision.docx".
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  changeRequestEvidence,
  changeRequests,
  clients,
  memberships,
  standardChangeCatalog,
  users,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { buildChangeRequestDocx } from "@/lib/change-control/docx-builder";

export const runtime = "nodejs";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function resolveMemberName(membershipId: string | null) {
  if (!membershipId) return null;
  const row = await db
    .select({ name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!row[0]) return null;
  return row[0].name ?? row[0].email;
}

export async function GET(
  _req: Request,
  ctxArg: { params: Promise<{ id: string; crid: string }> },
) {
  const { id, crid } = await ctxArg.params;
  const ctx = await requireContext();

  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) return new Response("Client not found", { status: 404 });

  const cr = await db.query.changeRequests.findFirst({
    where: and(
      eq(changeRequests.id, crid),
      eq(changeRequests.organizationId, ctx.organization.id),
      eq(changeRequests.clientId, id),
    ),
  });
  if (!cr) return new Response("Change request not found", { status: 404 });

  // Resolve the requester / implementer / change manager names.
  let preparedByName: string | null = null;
  let preparedByEmail: string | null = null;
  if (cr.requestedByMembershipId) {
    const row = await db
      .select({ name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.id, cr.requestedByMembershipId))
      .limit(1);
    if (row[0]) {
      preparedByName = row[0].name ?? row[0].email;
      preparedByEmail = row[0].email;
    }
  }
  const [implementerName, changeManagerName, catalogEntry, evidenceRows] =
    await Promise.all([
      resolveMemberName(cr.implementerMembershipId),
      resolveMemberName(cr.changeManagerMembershipId),
      cr.standardChangeCatalogId
        ? db.query.standardChangeCatalog.findFirst({
            where: eq(standardChangeCatalog.id, cr.standardChangeCatalogId),
          })
        : Promise.resolve(null),
      db
        .select({
          evidence: changeRequestEvidence,
          capturedByName: users.name,
          capturedByEmail: users.email,
        })
        .from(changeRequestEvidence)
        .leftJoin(
          memberships,
          eq(changeRequestEvidence.capturedByMembershipId, memberships.id),
        )
        .leftJoin(users, eq(memberships.userId, users.id))
        .where(eq(changeRequestEvidence.changeRequestId, cr.id))
        .orderBy(desc(changeRequestEvidence.capturedAt)),
    ]);

  const evidence = evidenceRows.map((r) => ({
    ...r.evidence,
    capturedByName: r.capturedByName ?? r.capturedByEmail ?? null,
  }));

  const buf = await buildChangeRequestDocx({
    cr,
    clientName: client.name,
    preparedByName,
    preparedByEmail,
    implementerName,
    changeManagerName,
    catalogEntry: catalogEntry ?? null,
    evidence,
  });

  const slug = slugify(client.name);
  const filename = `${cr.refCode}-${slug}.docx`;

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
