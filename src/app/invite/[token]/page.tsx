/**
 * Public accept-invitation page.
 *
 * No auth required — the recipient lands here via the email link and
 * sets their own password. On success they're redirected to /sign-in
 * to authenticate with the credentials they just established.
 */
import { Wrench } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberInvitations, organizations } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvitationForm } from "./accept-form";

export const metadata = { title: "Accept invitation · DealScope" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  executive: "Executive",
  manager: "Manager",
  member: "Member",
  external_diligence: "External — Diligence only",
};

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
    return <Status title="Invalid invitation link" message="The link is malformed. Ask your DealScope owner to send a fresh invitation." />;
  }

  const inv = await db.query.memberInvitations.findFirst({
    where: eq(memberInvitations.id, token),
  });
  if (!inv) {
    return <Status title="Invitation not found" message="This invitation no longer exists. It may have been revoked. Ask your DealScope owner for a fresh invitation." />;
  }
  if (inv.consumedAt) {
    return <Status title="Already accepted" message="This invitation has already been used. Sign in at /sign-in with the password you set." />;
  }
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) {
    return <Status title="Invitation expired" message="This invitation has expired. Ask your DealScope owner to send a fresh invitation." />;
  }

  // Pull org name + inviter name for nicer rendering.
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, inv.organizationId),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-fit rounded-lg bg-primary/10 p-3">
            <Wrench className="size-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Accept invitation</CardTitle>
          <CardDescription>
            You've been invited to <strong>{org?.name ?? "DealScope"}</strong> as a{" "}
            <strong>{ROLE_LABEL[inv.role] ?? inv.role}</strong>. Set a password
            to finish setting up your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInvitationForm token={token} email={inv.email} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Invited as <strong>{inv.email}</strong>. If you don't recognize
            this, close this tab — nothing is created until you submit.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Status({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-fit rounded-lg bg-primary/10 p-3">
            <Wrench className="size-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
