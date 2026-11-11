"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptInvitation } from "@/server/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AcceptInvitationForm({
  token,
  email,
  hasAccount,
  defaultName,
}: {
  token: string;
  email: string;
  /** Already signs in to DealScope: confirm with the existing password. */
  hasAccount: boolean;
  defaultName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hasAccount) {
      if (!name.trim()) return setError("Please enter your name.");
      if (password.length < 12) return setError("Password must be at least 12 characters.");
      if (password !== confirm) return setError("Passwords don't match.");
    } else if (!password) {
      return setError("Enter your DealScope password.");
    }
    start(async () => {
      const r = await acceptInvitation({ token, name: name.trim(), password });
      if (r?.serverError) return setError(r.serverError);
      toast.success(hasAccount ? "Invitation accepted. Sign in to continue." : "Account created. Sign in to continue.");
      router.push(`/sign-in?email=${encodeURIComponent(email)}`);
    });
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly autoComplete="username" />
      </div>

      {hasAccount ? (
        <div>
          <Label htmlFor="password">Your DealScope password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            You already have a DealScope login, so there&apos;s nothing new to set up.{" "}
            <Link href="/forgot-password" className="underline">
              Forgot password?
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoFocus
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Choose a password</Label>
              <button type="button" onClick={() => setShow((v) => !v)} className="text-xs text-muted-foreground underline">
                {show ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              id="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              At least 12 characters
              {password.length > 0 && password.length < 12 && ` — ${12 - password.length} more`}.
            </p>
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </div>
        </>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Joining…" : hasAccount ? "Accept invitation" : "Create account & join"}
      </Button>
    </form>
  );
}
