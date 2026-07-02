"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./action";

export function ForgotPasswordForm({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = use(searchParams);
  const [pending, setPending] = useState(false);

  if (params.sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          If that email has an account, a reset link was sent. Check your inbox
          (and spam folder).
        </p>
        <Link href="/sign-in" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    await requestPasswordReset(fd);
    // action always redirects to ?sent=1 — fallback in case redirect fails
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/sign-in" className="hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
