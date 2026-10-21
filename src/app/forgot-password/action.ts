"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isEmailConfigured } from "@/lib/email/graph";
import { issuePasswordToken, sendPasswordResetEmail } from "@/lib/email/account";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase().slice(0, 320) ?? "";

  if (email) {
    const ip = await clientIp();
    const [byEmail, byIp] = await Promise.all([
      rateLimit(`forgot:email:${email}`, 3, 60 * 60),
      rateLimit(`forgot:ip:${ip}`, 20, 60 * 60),
    ]);
    // The lookup and email happen after the response, so timing doesn't
    // reveal whether the address has an account.
    if (byEmail.ok && byIp.ok && isEmailConfigured()) {
      after(async () => {
        try {
          const user = await db.query.users.findFirst({ where: eq(users.email, email) });
          if (!user) return;
          const { link, expires } = await issuePasswordToken(email, 60 * 60 * 1000);
          await sendPasswordResetEmail({ to: email, link, expires });
        } catch (e) {
          console.error("[forgot-password]", e);
        }
      });
    }
  }

  // Always the same answer — never reveal whether the email exists.
  redirect("/forgot-password?sent=1");
}
