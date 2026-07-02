import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
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
    const { threadId, content } = await req.json() as { threadId: string; content: string };

    if (!threadId || !content?.trim()) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

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
