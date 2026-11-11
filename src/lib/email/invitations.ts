/**
 * Invitation emails: the invite itself, and a note to the inviter once it
 * has been accepted. Sent via Resend (`src/lib/email/graph.ts`) with the
 * shared layout from `./account`.
 */
import "server-only";
import { ROLE_SUMMARY, roleLabel, type RoleKey } from "@/lib/role-labels";
import { appBaseUrl, emailLayout, escapeHtml, fmt } from "./account";
import { sendEmail } from "./graph";

export type SendInvitationOpts = {
  to: string;
  inviterName: string;
  /** Replies go to the inviter rather than the no-reply sender. */
  inviterEmail?: string | null;
  orgName: string;
  role: string;
  /** Free-form note from the inviter — surfaced in the email if present. */
  note?: string | null;
  /** Invitation token (memberInvitations.id). */
  token: string;
  expiresAt: Date;
  /** The recipient already has a DealScope login (another organization). */
  existingAccount?: boolean;
  /** True when this is a re-send of an earlier invitation. */
  reminder?: boolean;
};

export async function sendInvitationEmail(opts: SendInvitationOpts): Promise<void> {
  const base = appBaseUrl();
  const acceptUrl = `${base}/invite/${opts.token}`;
  const role = roleLabel(opts.role);
  const summary = ROLE_SUMMARY[opts.role as RoleKey] ?? "";
  const inviter = escapeHtml(opts.inviterName);
  const org = escapeHtml(opts.orgName);

  const steps = opts.existingAccount
    ? `<li>Open the invitation and confirm with your existing DealScope password.</li>
       <li>${org} then appears in your account the next time you sign in.</li>`
    : `<li>Open the invitation and enter your name.</li>
       <li>Choose a password (at least 12 characters).</li>
       <li>Sign in at <a href="${escapeHtml(base)}/sign-in" style="color:#458C5E;">${escapeHtml(base.replace(/^https?:\/\//, ""))}</a> with <strong>${escapeHtml(opts.to)}</strong>.</li>`;

  const body = `
    <p style="margin:0 0 12px 0;"><strong>${inviter}</strong> invited you to join <strong>${org}</strong> on DealScope as ${/^[AEIOU]/i.test(role) ? "an" : "a"} <strong>${escapeHtml(role)}</strong>.</p>
    ${summary ? `<p style="margin:0 0 12px 0;font-size:13px;color:#555;">${escapeHtml(summary)}</p>` : ""}
    ${
      opts.note
        ? `<div style="margin:0 0 14px 0;padding:10px 12px;background:#f8f6ef;border-left:3px solid #458C5E;font-size:14px;white-space:pre-wrap;"><div style="font-size:11px;color:#777;margin-bottom:4px;">Note from ${inviter}</div>${escapeHtml(opts.note)}</div>`
        : ""
    }
    <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;">To get started</p>
    <ol style="margin:0;padding-left:20px;font-size:14px;">${steps}</ol>`;

  await sendEmail({
    to: opts.to,
    replyTo: opts.inviterEmail,
    subject: `${opts.reminder ? "Reminder: " : ""}${opts.inviterName} invited you to ${opts.orgName} on DealScope`,
    htmlBody: emailLayout(
      opts.reminder ? "Your invitation is waiting" : "You've been invited",
      body,
      { label: "Accept invitation", href: acceptUrl },
      `This link is just for <strong>${escapeHtml(opts.to)}</strong> and expires ${escapeHtml(fmt(opts.expiresAt))}.
       Questions? Reply to this email to reach ${inviter}. If you weren't expecting this, you can ignore it — nothing is set up until you accept.`,
    ),
  });
}

/** Let the person who sent the invitation know it was accepted. */
export async function sendInvitationAcceptedEmail(opts: {
  to: string;
  inviterName: string | null;
  memberName: string;
  memberEmail: string;
  orgName: string;
  role: string;
}): Promise<void> {
  const who = escapeHtml(opts.memberName || opts.memberEmail);
  const body = `
    <p style="margin:0 0 12px 0;">${opts.inviterName ? `Hi ${escapeHtml(opts.inviterName)},` : "Hi,"}</p>
    <p style="margin:0;"><strong>${who}</strong> (${escapeHtml(opts.memberEmail)}) accepted your invitation and joined
      <strong>${escapeHtml(opts.orgName)}</strong> as ${/^[AEIOU]/i.test(roleLabel(opts.role)) ? "an" : "a"} <strong>${escapeHtml(roleLabel(opts.role))}</strong>.</p>`;
  await sendEmail({
    to: opts.to,
    replyTo: opts.memberEmail,
    subject: `${opts.memberName || opts.memberEmail} joined ${opts.orgName} on DealScope`,
    htmlBody: emailLayout(
      "Invitation accepted",
      body,
      { label: "View members", href: `${appBaseUrl()}/settings/members` },
      "You're getting this because you sent the invitation.",
    ),
  });
}
