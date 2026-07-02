import { put } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { diligenceSessions } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const ctx = await requireContext();
  const { sid } = await params;

  const session = await db.query.diligenceSessions.findFirst({
    where: and(
      eq(diligenceSessions.id, sid),
      eq(diligenceSessions.organizationId, ctx.organization.id),
    ),
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const index = form.get("index") as string | null;
  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const { url } = await put(
    `diligence/sessions/${sid}/chunk-${index ?? "0"}-${Date.now()}.webm`,
    file,
    { access: "public" },
  );

  await db
    .update(diligenceSessions)
    .set({
      audioChunksJson: sql`audio_chunks_json || ${JSON.stringify([url])}::jsonb`,
    })
    .where(eq(diligenceSessions.id, sid));

  return NextResponse.json({ url });
}
