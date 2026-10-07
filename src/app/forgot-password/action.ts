"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isEmailConfigured } from "@/lib/email/graph";
import { issuePasswordToken, sendPasswordResetEmail } from "@/lib/email/account";

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";

  if (email) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (user && isEmailConfigured()) {
      try {
        const { link, expires } = await issuePasswordToken(email, 60 * 60 * 1000);
        await sendPasswordResetEmail({ to: email, link, expires });
      } catch (e) {
        // Don't reveal errors to the client, but keep them in the logs.
        console.error("[forgot-password]", e);
      }
    }
    // Always succeed — don't reveal whether the email exists
  }

  redirect("/forgot-password?sent=1");
}
