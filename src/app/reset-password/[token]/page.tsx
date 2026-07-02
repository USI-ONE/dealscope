import { Wrench } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Reset password · DealScope" };
export const dynamic = "force-dynamic";

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

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const row = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.token, token),
  });

  if (!row || !row.identifier.startsWith("reset:")) {
    return <Status title="Invalid link" message="This password reset link is invalid or has already been used." />;
  }

  if (row.expires < new Date()) {
    return <Status title="Link expired" message="This reset link has expired. Request a new one from the sign-in page." />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-fit rounded-lg bg-primary/10 p-3">
            <Wrench className="size-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>
            Set a new password for{" "}
            <strong>{row.identifier.replace("reset:", "")}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
