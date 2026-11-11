/**
 * Public accept-invitation page.
 *
 * No auth required — the recipient lands here via the email link and
 * sets their own password. On success they're redirected to /sign-in
 * to authenticate with the credentials they just established.
 */
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberInvitations, memberships, organizations, users } from "@/db/schema";
import { ROLE_SUMMARY, roleLabel, type RoleKey } from "@/lib/role-labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvitationForm } from "./accept-form";

export const metadata = { title: "Accept invitation · DealScope" };
export const dynamic = "force-dynamic";


function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isUuid(token)) {
    return <Status title="Invalid invitation link" message="The link is malformed. Ask the person who invited you to resend it." />;
  }

  const inv = await db.query.memberInvitations.findFirst({
    where: eq(memberInvitations.id, token),
  });
  if (!inv) {
    return <Status title="Invitation not found" message="This invitation no longer exists. It may have been revoked. Ask the person who invited you to send a new one." />;
  }
  if (inv.consumedAt) {
    return <Status title="Already accepted" message="This invitation has already been used. Sign in with the password you set." signIn={inv.email} />;
  }
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) {
    return <Status title="Invitation expired" message="This invitation has expired. Ask the person who invited you to resend it." />;
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, inv.organizationId),
  });
  const [inviter] = inv.invitedByMembershipId
    ? await db
        .select({ name: users.name, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.id, inv.invitedByMembershipId))
    : [];
  // Someone who already signs in to DealScope confirms with their existing
  // password instead of being asked to create a new one.
  const account = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${inv.email.toLowerCase()}`,
    columns: { passwordHash: true, name: true },
  });
  const hasAccount = !!account?.passwordHash;
  const orgName = org?.name ?? "DealScope";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-fit rounded-lg bg-primary/10 p-3">
            <UserPlus className="size-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Join {orgName}</CardTitle>
          <CardDescription>
            {inviter ? (
              <>
                <strong>{inviter.name ?? inviter.email}</strong> invited you
              </>
            ) : (
              "You've been invited"
            )}{" "}
            as {/^[AEIOU]/i.test(roleLabel(inv.role)) ? "an" : "a"} <strong>{roleLabel(inv.role)}</strong>.{" "}
            {ROLE_SUMMARY[inv.role as RoleKey] ?? ""}
          </CardDescription>
          {inv.note && (
            <blockquote className="whitespace-pre-wrap rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2 text-left text-sm">
              {inv.note}
            </blockquote>
          )}
        </CardHeader>
        <CardContent>
          <AcceptInvitationForm token={token} email={inv.email} hasAccount={hasAccount} defaultName={account?.name ?? ""} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Invited as <strong>{inv.email}</strong>. If you don't recognize
            this, close this tab — nothing is created until you submit.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Status({ title, message, signIn }: { title: string; message: string; signIn?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-fit rounded-lg bg-primary/10 p-3">
            <UserPlus className="size-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        {signIn && (
          <CardContent>
            <Link
              href={`/sign-in?email=${encodeURIComponent(signIn)}`}
              className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
            >
              Go to sign in
            </Link>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
