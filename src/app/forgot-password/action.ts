"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { sendEmail, isEmailConfigured } from "@/lib/email/graph";

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";

  if (email) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (user) {
      const token = nanoid(48);
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Delete any existing reset token for this email first
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, `reset:${email}`));

      await db.insert(verificationTokens).values({
        identifier: `reset:${email}`,
        token,
        expires,
      });

      if (isEmailConfigured()) {
        const baseUrl =
          process.env.AUTH_URL ??
          (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000");
        const resetLink = `${baseUrl}/reset-password/${token}`;
        await sendEmail({
          to: email,
          subject: "Reset your DealScope password",
          htmlBody: `
            <p>Hi,</p>
            <p>Someone requested a password reset for your DealScope account (<strong>${email}</strong>).</p>
            <p><a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a></p>
            <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          `,
        }).catch(() => {/* don't reveal errors to client */});
      }
    }
    // Always succeed — don't reveal whether the email exists
  }

  redirect("/forgot-password?sent=1");
}
