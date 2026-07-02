import { UserCircle2 } from "lucide-react";
import { requireContext } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const ctx = await requireContext();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-3">
          <UserCircle2 className="size-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account</h1>
          <p className="text-muted-foreground">
            Signed in as <strong>{ctx.user.name ?? ctx.user.email}</strong>{" "}
            <span className="text-xs">({ctx.user.email})</span>
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
