import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { contentDisposition } from "@/lib/security/blob-policy";
import { auth } from "@/auth";
import { db } from "@/db";
import { diligenceEngagements, diligenceVaultFiles, memberships, users } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { id: engagementId, fileId } = await params;

    const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 401 });

    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.userId, user.id), eq(memberships.isActive, true)),
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const engagement = await db.query.diligenceEngagements.findFirst({
      where: and(
        eq(diligenceEngagements.id, engagementId),
        eq(diligenceEngagements.organizationId, membership.organizationId),
      ),
    });
    if (!engagement) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const file = await db.query.diligenceVaultFiles.findFirst({
      where: and(
        eq(diligenceVaultFiles.id, fileId),
        eq(diligenceVaultFiles.engagementId, engagementId),
      ),
    });
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const blob = await get(file.blobPathname, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return NextResponse.json({ error: "File not accessible" }, { status: 502 });
    }

    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": contentDisposition("attachment", file.name),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Length": String(blob.blob.size),
    });
    return new NextResponse(blob.stream, { status: 200, headers });
  } catch (e) {
    console.error("Vault download error:", e);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
