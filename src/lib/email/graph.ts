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
  /** Where replies go — usually the person who triggered the email, since
   *  the sender address is a no-reply mailbox. */
  replyTo?: string | null;
  subject: string;
  htmlBody: string;
  /** Plain-text part. Derived from the HTML when omitted (helps delivery). */
  textBody?: string;
};

/** Rough plain-text rendering of an email's HTML for the text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, "").trim();
      return l && l !== href ? `${l}: ${href}` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
      to: [msg.toName ? `${msg.toName.replace(/[<>",]/g, "")} <${msg.to}>` : msg.to],
      cc: msg.cc ?? [],
      ...(msg.replyTo ? { reply_to: [msg.replyTo] } : {}),
      subject: msg.subject,
      html: msg.htmlBody,
      text: msg.textBody ?? htmlToText(msg.htmlBody),
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Resend sendEmail failed (${r.status}): ${text}`);
  }
}
