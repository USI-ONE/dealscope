"use server";

import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { hashPassword, validatePasswordStrength } from "@/lib/auth-password";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export async function resetPassword(formData: FormData): Promise<{ error: string } | void> {
  const token = ((formData.get("token") as string | null) ?? "").slice(0, 100);
  const password = (formData.get("password") as string | null) ?? "";

  if (!(await rateLimit(`reset:ip:${await clientIp()}`, 20, 15 * 60)).ok) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  if (!token) redirect("/sign-in?error=Default");
  const policyError = validatePasswordStrength(password);
  if (policyError) return { error: policyError };

  // Consume the token in the same statement that checks it, so it can only
  // ever be used once.
  const [row] = await db
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.token, token), gt(verificationTokens.expires, new Date())))
    .returning({ identifier: verificationTokens.identifier });
  if (!row || !row.identifier.startsWith("reset:")) {
    redirect("/sign-in?error=Default");
  }

  const email = row.identifier.replace("reset:", "");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), passwordSetAt: new Date(), mustChangePassword: false })
    .where(eq(users.email, email));

  redirect("/sign-in?reset=1");
}
