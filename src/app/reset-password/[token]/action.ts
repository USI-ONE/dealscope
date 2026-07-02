"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";

export async function resetPassword(formData: FormData): Promise<void> {
  const token = (formData.get("token") as string | null) ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!token || password.length < 8) {
    redirect("/sign-in?error=Default");
  }

  const row = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.token, token),
    ),
  });

  if (!row || !row.identifier.startsWith("reset:") || row.expires < new Date()) {
    redirect("/sign-in?error=Default");
  }

  const email = row.identifier.replace("reset:", "");
  const hash = await bcrypt.hash(password, 12);

  await db
    .update(users)
    .set({ passwordHash: hash, passwordSetAt: new Date(), mustChangePassword: false })
    .where(eq(users.email, email));

  // Consume the token
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.token, token));

  redirect("/sign-in?reset=1");
}
