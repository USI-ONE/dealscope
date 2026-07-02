/**
 * Outbound email via Resend (https://resend.com).
 *
 * Required env vars:
 *   RESEND_API_KEY    — your Resend API key (re_...)
 *   INVITE_FROM_EMAIL — verified sender address in Resend
 */
import "server-only";

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.INVITE_FROM_EMAIL);
}

export type EmailMessage = {
  to: string;
  toName?: string;
  cc?: string[];
  subject: string;
  htmlBody: string;
};

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.INVITE_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and INVITE_FROM_EMAIL.",
    );
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `DealScope <${fromEmail}>`,
      to: [msg.to],
      cc: msg.cc ?? [],
      subject: msg.subject,
      html: msg.htmlBody,
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Resend sendEmail failed (${r.status}): ${text}`);
  }
}
