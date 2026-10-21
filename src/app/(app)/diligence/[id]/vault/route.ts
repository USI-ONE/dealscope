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
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { diligenceEngagements, diligenceVaultFiles } from "@/db/schema";
import { AuthError, requirePermission } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let ctx: Awaited<ReturnType<typeof requirePermission>>;
  try {
    ctx = await requirePermission("update", "diligence");
  } catch (e) {
    const status = e instanceof AuthError && e.code === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Forbidden" : "Unauthenticated" }, { status });
  }
  try {

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
      // Unguessable object names: a pathname alone must never locate a file.
      addRandomSuffix: true,
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
    console.error("Vault upload error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
