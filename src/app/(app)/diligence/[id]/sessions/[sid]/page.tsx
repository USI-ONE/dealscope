import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import {
  diligenceAttendees,
  diligenceEngagements,
  diligenceSessions,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import {
  SessionEditor,
  SessionMetaBadges,
} from "@/components/diligence/session-editor";
import { RecordingPanel } from "@/components/diligence/recording-panel";

export const metadata = { title: "DealScope · Diligence Session" };

export default async function TechOsDiligenceSessionPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  const ctx = await requireContext();

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) notFound();

  const session = await db.query.diligenceSessions.findFirst({
    where: and(
      eq(diligenceSessions.id, sid),
      eq(diligenceSessions.engagementId, engagement.id),
    ),
  });
  if (!session) notFound();

  const attendees = await db
    .select()
    .from(diligenceAttendees)
    .where(eq(diligenceAttendees.sessionId, session.id))
    .orderBy(asc(diligenceAttendees.fullName));

  const canEdit = can("update", "diligence", { role: ctx.membership.role });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/diligence/${engagement.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to {engagement.targetCompanyName}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{session.title}</h1>
        <div className="mt-2">
          <SessionMetaBadges
            session={{
              scheduledAt: session.scheduledAt,
              durationMinutes: session.durationMinutes,
              location: session.location,
              mode: session.mode,
            }}
          />
        </div>
      </div>

      {canEdit && (
        <RecordingPanel
          sessionId={session.id}
          engagementId={engagement.id}
          initialStatus={session.transcriptStatus ?? "none"}
        />
      )}

      <SessionEditor
        session={{
          id: session.id,
          engagementId: engagement.id,
          title: session.title,
          scheduledAt: session.scheduledAt,
          durationMinutes: session.durationMinutes,
          location: session.location,
          mode: session.mode,
          notes: session.notes,
          summary: session.summary,
        }}
        attendees={attendees.map((a) => ({
          id: a.id,
          side: a.side,
          fullName: a.fullName,
          title: a.title,
          email: a.email,
          notes: a.notes,
        }))}
        canEdit={canEdit}
      />
    </div>
  );
}
