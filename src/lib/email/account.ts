/**
 * Account emails (welcome / password reset) sent via Resend.
 *
 * Both carry a one-time `/reset-password/[token]` link so the user picks
 * their own password — plaintext passwords are never emailed.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { sendEmail } from "./graph";

/**
 * Public base URL for links in emails. AUTH_URL / APP_URL win; on Vercel
 * fall back to the production domain (VERCEL_URL is the per-deployment
 * URL, which can sit behind deployment protection).
 */
export function appBaseUrl(): string {
  const explicit = process.env.AUTH_URL?.trim() || process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Replace any outstanding set/reset token for this email with a new one. */
export async function issuePasswordToken(email: string, ttlMs: number) {
  const identifier = `reset:${email.trim().toLowerCase()}`;
  const token = nanoid(48);
  const expires = new Date(Date.now() + ttlMs);
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
  await db.insert(verificationTokens).values({ identifier, token, expires });
  return { link: `${appBaseUrl()}/reset-password/${token}`, expires };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(d: Date) {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Denver",
    timeZoneName: "short",
  });
}

function layout(heading: string, body: string, cta: { label: string; href: string }, footer: string) {
  return `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f1ea;padding:32px;color:#1a1a1a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="padding:24px 28px 0 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#458C5E;">DealScope</div>
        <h1 style="font-size:20px;font-weight:700;margin:8px 0 0 0;">${heading}</h1>
      </div>
      <div style="padding:18px 28px 24px 28px;font-size:15px;line-height:1.55;">
        ${body}
        <p style="margin:20px 0;">
          <a href="${cta.href}" style="display:inline-block;padding:12px 22px;background:#458C5E;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;">${cta.label}</a>
        </p>
        <p style="margin:0;font-size:12px;color:#6b6b6b;">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all;">${cta.href}</span></p>
      </div>
      <div style="padding:14px 28px;background:#faf8f3;font-size:12px;color:#6b6b6b;">${footer}</div>
    </div>
  </body>
</html>`;
}

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  inviterName: string;
  orgName: string;
  roleLabel: string;
  link: string;
  expires: Date;
}) {
  const body = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(opts.name)},</p>
    <p style="margin:0 0 12px 0;"><strong>${escapeHtml(opts.inviterName)}</strong> created a DealScope account for you
      in <strong>${escapeHtml(opts.orgName)}</strong> as a <strong>${escapeHtml(opts.roleLabel)}</strong>.</p>
    <p style="margin:0;">Choose your password to finish setting up. You'll sign in with <strong>${escapeHtml(opts.to)}</strong>.</p>`;
  await sendEmail({
    to: opts.to,
    toName: opts.name,
    subject: `${opts.inviterName} set up your DealScope account`,
    htmlBody: layout(
      "Welcome to DealScope",
      body,
      { label: "Set your password", href: opts.link },
      `This link works once and expires ${escapeHtml(fmt(opts.expires))}. After that, use “Forgot password” on the sign-in page.`,
    ),
  });
}

export async function sendPasswordResetEmail(opts: { to: string; link: string; expires: Date; byAdmin?: string }) {
  const body = opts.byAdmin
    ? `<p style="margin:0;"><strong>${escapeHtml(opts.byAdmin)}</strong> reset the password on your DealScope account (<strong>${escapeHtml(opts.to)}</strong>). Choose a new one to sign in.</p>`
    : `<p style="margin:0;">Someone requested a password reset for your DealScope account (<strong>${escapeHtml(opts.to)}</strong>).</p>`;
  await sendEmail({
    to: opts.to,
    subject: "Reset your DealScope password",
    htmlBody: layout(
      "Choose a new password",
      body,
      { label: "Set a new password", href: opts.link },
      `This link works once and expires ${escapeHtml(fmt(opts.expires))}.${opts.byAdmin ? "" : " If you didn't request this, you can ignore this email."}`,
    ),
  });
}
