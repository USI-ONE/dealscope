import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";

const replySchema = z.object({
  threadId: z.string().uuid(),
  content: z.string().trim().min(1).max(10_000),
});
import { db } from "@/db";
import {
  diligenceDialogueMessages,
  diligenceDialogueThreads,
  diligencePartyInvitations,
} from "@/db/schema";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const parsed = replySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const { threadId, content } = parsed.data;
    const limit = await rateLimit(`dealroom-reply:${token}:${ipFromRequest(req)}`, 30, 60 * 60);
    if (!limit.ok) return NextResponse.json({ error: "Too many replies — try again later." }, { status: 429 });

    const invitation = await db.query.diligencePartyInvitations.findFirst({
      where: and(
        eq(diligencePartyInvitations.token, token),
        gt(diligencePartyInvitations.expiresAt, new Date()),
      ),
    });

    if (!invitation || invitation.role === "viewer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const thread = await db.query.diligenceDialogueThreads.findFirst({
      where: and(
        eq(diligenceDialogueThreads.id, threadId),
        eq(diligenceDialogueThreads.engagementId, invitation.engagementId),
        eq(diligenceDialogueThreads.isInternal, false),
      ),
    });

    if (!thread || thread.status === "closed") {
      return NextResponse.json({ error: "Thread not found or closed" }, { status: 404 });
    }

    await db.insert(diligenceDialogueMessages).values({
      threadId,
      content: content.trim(),
      fromInvitationId: invitation.id,
      isInternal: false,
    });

    // Update thread status to "open" (re-open if answered)
    await db
      .update(diligenceDialogueThreads)
      .set({ status: "open" })
      .where(eq(diligenceDialogueThreads.id, threadId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("External reply error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
