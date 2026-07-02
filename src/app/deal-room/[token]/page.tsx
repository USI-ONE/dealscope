import { notFound } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  diligenceDialogueMessages,
  diligenceDialogueThreads,
  diligenceEngagements,
  diligenceParties,
  diligencePartyInvitations,
  diligenceVaultFiles,
} from "@/db/schema";
import { ExternalDealRoom } from "./external-deal-room";

export const metadata = { title: "DealScope · Deal Room" };

export default async function ExternalDealRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invitation = await db.query.diligencePartyInvitations.findFirst({
    where: and(
      eq(diligencePartyInvitations.token, token),
      gt(diligencePartyInvitations.expiresAt, new Date()),
    ),
    with: { party: true },
  });

  if (!invitation) notFound();

  // Mark last accessed
  await db
    .update(diligencePartyInvitations)
    .set({ lastAccessedAt: new Date(), acceptedAt: invitation.acceptedAt ?? new Date() })
    .where(eq(diligencePartyInvitations.id, invitation.id));

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: eq(diligenceEngagements.id, invitation.engagementId),
    columns: { id: true, targetCompanyName: true, codename: true },
  });
  if (!engagement) notFound();

  const [sharedFiles, threads] = await Promise.all([
    db
      .select()
      .from(diligenceVaultFiles)
      .where(
        and(
          eq(diligenceVaultFiles.engagementId, invitation.engagementId),
          eq(diligenceVaultFiles.accessTier, "shared"),
        ),
      )
      .orderBy(diligenceVaultFiles.createdAt),
    db.query.diligenceDialogueThreads.findMany({
      where: and(
        eq(diligenceDialogueThreads.engagementId, invitation.engagementId),
        eq(diligenceDialogueThreads.isInternal, false),
      ),
      with: {
        messages: {
          where: eq(diligenceDialogueMessages.isInternal, false),
          orderBy: (m, { asc }) => [asc(m.createdAt)],
        },
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
  ]);

  return (
    <ExternalDealRoom
      token={token}
      invitation={{
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
      }}
      party={{ id: invitation.party.id, name: invitation.party.name, role: invitation.party.role }}
      engagement={{ id: engagement.id, targetCompanyName: engagement.targetCompanyName, codename: engagement.codename }}
      sharedFiles={sharedFiles.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        track: f.track,
        blobUrl: f.blobUrl,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        createdAt: f.createdAt.toISOString(),
      }))}
      threads={threads
        .filter((t) => !t.isInternal)
        .map((t) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          messageCount: t.messages.filter((m) => !m.isInternal).length,
          lastActivity: t.messages.length > 0
            ? t.messages[t.messages.length - 1]!.createdAt.toISOString()
            : t.createdAt.toISOString(),
          messages: t.messages
            .filter((m) => !m.isInternal)
            .map((m) => ({
              id: m.id,
              content: m.content,
              fromInvitationId: m.fromInvitationId,
              isExternal: m.fromInvitationId === invitation.id,
              createdAt: m.createdAt.toISOString(),
            })),
        }))}
    />
  );
}
