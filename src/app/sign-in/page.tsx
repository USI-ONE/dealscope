import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { authenticate } from "./auth-action";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Email or password is incorrect.",
  CallbackRouteError: "Email or password is incorrect.",
  Configuration: "Sign-in is misconfigured. Contact your DealScope owner.",
  Default: "Sign-in failed. Try again or contact your DealScope owner.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; email?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/";
  const error = params.error;
  const prefillEmail = params.email ?? "";
  const errorMessage = error
    ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default
    : null;
  const didReset = params.reset === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm shadow-xl border-border/60">
        <CardHeader className="space-y-3 text-center pb-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-6">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L17 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight">DealScope</CardTitle>
            <CardDescription className="mt-1 text-sm">
              M&amp;A due diligence platform
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {didReset && (
            <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400">
              Password updated — sign in with your new password.
            </div>
          )}
          {errorMessage && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}
          <form action={authenticate} className="space-y-3">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={prefillEmail}
                required
                autoFocus={!prefillEmail}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" size="lg">
              Sign in
            </Button>
          </form>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Access is created by your DealScope owner.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
