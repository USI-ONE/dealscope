/**
 * Invitation email composition + send. Uses Microsoft Graph
 * (`src/lib/email/graph.ts`) so no third-party email vendor is needed —
 * mail goes out from the tenant's own M365 mailbox.
 */
import "server-only";
import { sendEmail } from "./graph";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  executive: "Executive",
  manager: "Manager",
  member: "Member",
  external_diligence: "External — Diligence only",
};

const ROLE_DESCRIPTION: Record<string, string> = {
  owner:
    "full access — can invite and remove members, change roles, and manage everything",
  executive: "read access across the platform with finance access",
  manager:
    "the ability to add and edit operational data (clients, hardware, services)",
  member: "view-only access by default",
  external_diligence:
    "access only to the Diligence section — no clients, vendors, finance, services, licenses, or settings",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type SendInvitationOpts = {
  to: string;
  toName?: string;
  inviterName: string;
  role: string;
  /** Free-form note from the inviter — surfaced in the email if present. */
  note?: string | null;
  /** Base URL of the TechOS deployment, e.g. https://techos-gold.vercel.app */
  baseUrl: string;
  /** Invitation token (memberInvitations.id) — the recipient clicks
   *  /invite/[token] and sets their own password. */
  token: string;
  /** When this invitation stops being valid. */
  expiresAt: Date;
};

export async function sendInvitationEmail(
  opts: SendInvitationOpts,
): Promise<void> {
  const roleLabel = ROLE_LABEL[opts.role] ?? opts.role;
  const roleDescription = ROLE_DESCRIPTION[opts.role] ?? "";
  const acceptUrl = `${opts.baseUrl.replace(/\/$/, "")}/invite/${opts.token}`;
  const expiresLabel = opts.expiresAt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const subject = `${opts.inviterName} invited you to DealScope`;

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f1ea; padding:32px; color:#1a1a1a;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="padding:24px 28px 0 28px;">
        <div style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#458C5E;">DealScope</div>
        <h1 style="font-size:20px; font-weight:700; margin:8px 0 0 0;">You've been invited</h1>
      </div>
      <div style="padding:18px 28px 24px 28px; font-size:15px; line-height:1.55;">
        <p style="margin:0 0 12px 0;">
          <strong>${escapeHtml(opts.inviterName)}</strong> invited you to join
          <strong>DealScope</strong> as a <strong>${escapeHtml(roleLabel)}</strong>.
        </p>
        ${
          roleDescription
            ? `<p style="margin:0 0 12px 0; font-size:13px; color:#555;">That role gives you ${escapeHtml(roleDescription)}.</p>`
            : ""
        }
        ${
          opts.note
            ? `<div style="margin:0 0 16px 0; padding:10px 12px; background:#f8f6ef; border-left:3px solid #458C5E; font-size:13px; white-space:pre-wrap;">${escapeHtml(opts.note)}</div>`
            : ""
        }
        <p style="margin:0 0 8px 0; font-size:14px;">
          Click the button below to accept the invitation and set a password.
          The link is unique to you and expires <strong>${escapeHtml(expiresLabel)}</strong>.
        </p>
        <p style="margin:18px 0 8px 0;">
          <a href="${escapeHtml(acceptUrl)}" style="display:inline-block; padding:10px 20px; background:#458C5E; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:600; font-size:14px;">
            Accept DealScope invitation
          </a>
        </p>
        <p style="margin:18px 0 0 0; font-size:12px; color:#777;">
          Or paste this link into your browser:<br/>
          <span style="color:#444;">${escapeHtml(acceptUrl)}</span>
        </p>
      </div>
      <div style="padding:14px 28px; background:#fafaf5; border-top:1px solid #ebe7dc; font-size:11px; color:#888;">
        Sent because you were invited as <strong>${escapeHtml(opts.to)}</strong>.
        If you don't recognize this, you can safely ignore this email.
      </div>
    </div>
  </body>
</html>`;

  await sendEmail({
    to: opts.to,
    toName: opts.toName,
    subject,
    htmlBody: html,
  });
}
