/**
 * GET /deal-room/[token]/file/[fileId] — download a file shared into a deal
 * room. The invitation token is the credential; only files marked "shared"
 * on that invitation's engagement are served, always as a download.
 */
import { get } from "@vercel/blob";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { diligencePartyInvitations, diligenceVaultFiles } from "@/db/schema";
import { contentDisposition } from "@/lib/security/blob-policy";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(fileId)) {
    return new Response("Not found", { status: 404 });
  }
  const invitation = await db.query.diligencePartyInvitations.findFirst({
    where: and(eq(diligencePartyInvitations.token, token), gt(diligencePartyInvitations.expiresAt, new Date())),
    columns: { engagementId: true, organizationId: true },
  });
  if (!invitation) return new Response("Not found", { status: 404 });

  const file = await db.query.diligenceVaultFiles.findFirst({
    where: and(
      eq(diligenceVaultFiles.id, fileId),
      eq(diligenceVaultFiles.engagementId, invitation.engagementId),
      eq(diligenceVaultFiles.organizationId, invitation.organizationId),
      eq(diligenceVaultFiles.accessTier, "shared"),
    ),
    columns: { name: true, blobPathname: true },
  });
  if (!file) return new Response("Not found", { status: 404 });

  const blob = await get(file.blobPathname, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream) return new Response("Not available", { status: 502 });
  return new Response(blob.stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": contentDisposition("attachment", file.name),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
