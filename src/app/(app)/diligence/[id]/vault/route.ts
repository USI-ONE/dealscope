/**
 * POST /diligence/[id]/vault
 *
 * Multipart file upload → Vercel Blob → inserts diligence_vault_files row.
 * Returns { file } on success.
 *
 * FormData fields:
 *   file        — the binary file (required)
 *   track       — string (optional, nullable)
 *   description — string (optional)
 *   accessTier  — "private" | "shared" (default "private")
 */
import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { diligenceEngagements, diligenceVaultFiles, memberships, organizations, users } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.userId, user.id), eq(memberships.isActive, true)),
    });
    if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, membership.organizationId),
    });
    if (!organization) return NextResponse.json({ error: "No org" }, { status: 403 });

    const ctx = { user, membership, organization };

    const { id: engagementId } = await params;

    const engagement = await db.query.diligenceEngagements.findFirst({
      where: eq(diligenceEngagements.id, engagementId),
    });
    if (!engagement || engagement.organizationId !== ctx.organization.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const track = (formData.get("track") as string | null) || null;
    const description = (formData.get("description") as string | null) || null;
    const accessTier =
      (formData.get("accessTier") as string | null) === "shared" ? "shared" : "private";

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `dealscope/${ctx.organization.id}/${engagementId}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const blob = await put(pathname, buffer, {
      access: "private",
      contentType: file.type || "application/octet-stream",
    });

    const [inserted] = await db.insert(diligenceVaultFiles).values({
      organizationId: ctx.organization.id,
      engagementId,
      track,
      name: file.name,
      description,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      sizeBytes: file.size,
      mimeType: file.type || null,
      accessTier,
      uploadedByMembershipId: ctx.membership.id,
    }).returning();

    return NextResponse.json({ file: inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Vault upload error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
