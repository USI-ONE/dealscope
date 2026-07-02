import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
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

    const blobRes = await fetch(file.blobUrl, {
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    });

    if (!blobRes.ok) {
      return NextResponse.json({ error: "File not accessible" }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", file.mimeType ?? "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${file.name}"`);
    const ct = blobRes.headers.get("content-length");
    if (ct) headers.set("Content-Length", ct);

    return new NextResponse(blobRes.body, { status: 200, headers });
  } catch (e) {
    console.error("Vault download error:", e);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
