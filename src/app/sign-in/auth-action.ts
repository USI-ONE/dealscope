"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export async function authenticate(formData: FormData): Promise<void> {
  const callbackUrl =
    (formData.get("callbackUrl") as string | null) || "/";
  try {
    // NextAuth v5: on success, throws NEXT_REDIRECT (re-thrown below).
    // On failure, throws AuthError — caught here to produce a friendly URL.
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const params = new URLSearchParams({
        error: err.type ?? "Default",
        callbackUrl,
      });
      redirect(`/sign-in?${params.toString()}`);
    }
    // Re-throw NEXT_REDIRECT so Next.js can perform the success redirect.
    throw err;
  }
}
