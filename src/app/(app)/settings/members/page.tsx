import { and, desc, eq, isNull } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/db";
import { memberInvitations, memberships, users } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateUserForm } from "@/components/settings/create-user-form";
import { InviteUserForm } from "@/components/settings/invite-user-form";
import { MembersTable, type MemberRow } from "@/components/settings/members-table";
import {
  PendingInvitationsTable,
  type PendingInvitationRow,
} from "@/components/settings/pending-invitations-table";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await requireContext();
  const isOwner = ctx.membership.role === "owner";

  const memberRowsRaw = await db
    .select({ membership: memberships, user: users })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, ctx.organization.id))
    .orderBy(memberships.role, users.email);

  const data: MemberRow[] = memberRowsRaw.map((r) => ({
    membershipId: r.membership.id,
    userId: r.user.id,
    email: r.user.email,
    name: r.user.name,
    image: r.user.image,
    role: r.membership.role,
    financeAccess: r.membership.financeAccess,
    isActive: r.membership.isActive,
    joinedAt: r.membership.joinedAt,
  }));

  // Split active / deactivated so each renders in its own section.
  // Pending-invitation rows live in a separate table below.
  const activeMembers = data.filter((m) => m.isActive);
  const deactivatedMembers = data.filter((m) => !m.isActive);

  // Pending invitations (not yet accepted) for this org.
  const invitationsRaw = await db
    .select({
      invitation: memberInvitations,
      inviterName: users.name,
      inviterEmail: users.email,
    })
    .from(memberInvitations)
    .leftJoin(memberships, eq(memberInvitations.invitedByMembershipId, memberships.id))
    .leftJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberInvitations.organizationId, ctx.organization.id),
        isNull(memberInvitations.consumedAt),
      ),
    )
    .orderBy(desc(memberInvitations.createdAt));

  // Resolve the base URL the same way the server action does so the
  // "Copy link" button produces a URL that actually works.
  const baseUrl =
    process.env.AUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const invitations: PendingInvitationRow[] = invitationsRaw.map((r) => ({
    id: r.invitation.id,
    email: r.invitation.email,
    role: r.invitation.role,
    financeAccess: r.invitation.financeAccess,
    invitedByName: r.inviterName ?? r.inviterEmail ?? null,
    invitedAt: r.invitation.createdAt,
    expiresAt: r.invitation.expiresAt,
    lastEmailSentAt: r.invitation.lastEmailSentAt,
    emailSendAttemptCount: r.invitation.emailSendAttemptCount,
    lastEmailError: r.invitation.lastEmailError,
    note: r.invitation.note,
    baseUrl,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <Users className="size-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Members</h1>
            <p className="text-muted-foreground">
              TechOS uses standalone email + password authentication. Owners
              create accounts here and share credentials with the user
              out-of-band. Users can change their own password from{" "}
              <strong>Settings → Account</strong>.
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="flex flex-col items-end gap-2">
            <InviteUserForm />
            <CreateUserForm />
          </div>
        )}
      </div>

      {!isOwner && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Read-only</CardTitle>
            <CardDescription>
              Only owners can create accounts or change roles, finance
              access, or activation. Contact your TechOS owner to make
              changes.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Active members
        </h2>
        <MembersTable
          members={activeMembers}
          currentMembershipId={ctx.membership.id}
          isOwner={isOwner}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Pending invitations
        </h2>
        <PendingInvitationsTable invitations={invitations} isOwner={isOwner} />
      </section>

      {deactivatedMembers.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Deactivated members
          </h2>
          <p className="text-xs text-muted-foreground">
            These accounts can&apos;t sign in and don&apos;t appear in any
            assignee picker. Reactivate from the row menu to restore access.
          </p>
          <MembersTable
            members={deactivatedMembers}
            currentMembershipId={ctx.membership.id}
            isOwner={isOwner}
          />
        </section>
      )}
    </div>
  );
}
