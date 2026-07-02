import { put } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { diligenceSessions } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  try {
    const ctx = await requireContext();
    const { sid } = await params;

    const session = await db.query.diligenceSessions.findFirst({
      where: and(
        eq(diligenceSessions.id, sid),
        eq(diligenceSessions.organizationId, ctx.organization.id),
      ),
    });
    if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const apiKey = (process.env.DEEPGRAM_API_KEY ?? "").replace(/^﻿/, "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "DEEPGRAM_API_KEY is not configured. Add it to Vercel environment variables." },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

    const audioBuffer = Buffer.from(await file.arrayBuffer());
    if (audioBuffer.length === 0) {
      return NextResponse.json({ error: "Recording is empty — nothing to transcribe." }, { status: 400 });
    }

    // Upload to Vercel Blob for archive
    await db
      .update(diligenceSessions)
      .set({ transcriptStatus: "uploading" })
      .where(eq(diligenceSessions.id, sid));

    let audioUrl = "";
    try {
      const blob = await put(
        `diligence/sessions/${sid}/recording.webm`,
        audioBuffer,
        { access: "public", contentType: "audio/webm" },
      );
      audioUrl = blob.url;
    } catch (blobErr) {
      // Non-fatal — continue without archiving if Blob write fails
      console.error("[transcribe] Blob upload failed:", blobErr);
    }

    await db
      .update(diligenceSessions)
      .set({ audioUrl: audioUrl || null, transcriptStatus: "transcribing" })
      .where(eq(diligenceSessions.id, sid));

    // Transcribe via Deepgram REST API — nova-2
    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "audio/webm",
        },
        body: audioBuffer,
      },
    );

    if (!dgRes.ok) {
      const errBody = await dgRes.text().catch(() => dgRes.statusText);
      await db
        .update(diligenceSessions)
        .set({ transcriptStatus: "error" })
        .where(eq(diligenceSessions.id, sid));
      return NextResponse.json(
        { error: `Deepgram ${dgRes.status}: ${errBody.slice(0, 300)}` },
        { status: 502 },
      );
    }

    type DgResponse = {
      results: { channels: Array<{ alternatives: Array<{ transcript: string }> }> };
    };
    const dgData = (await dgRes.json()) as DgResponse;
    const transcriptText =
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    await db
      .update(diligenceSessions)
      .set({ transcriptText, transcriptStatus: "extracting" })
      .where(eq(diligenceSessions.id, sid));

    return NextResponse.json({ transcript: transcriptText });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] Unhandled error:", message);
    return NextResponse.json(
      { error: `Server error: ${message.slice(0, 200)}` },
      { status: 500 },
    );
  }
}
