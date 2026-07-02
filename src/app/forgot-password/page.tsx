import { Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Forgot password · DealScope" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto rounded-lg bg-primary/10 p-3 w-fit">
            <Wrench className="size-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            Enter your email address and we&apos;ll send you a reset link if an
            account exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm searchParams={searchParams} />
        </CardContent>
      </Card>
    </div>
  );
}
