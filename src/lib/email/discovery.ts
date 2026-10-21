/**
 * Site-walk emails: the client info request, and the "they answered"
 * notice back to whoever sent it. Same branded layout as account emails.
 */
import "server-only";
import { emailLayout, escapeHtml, fmt } from "./account";
import { sendEmail } from "./graph";

export async function sendInfoRequestEmail(opts: {
  to: string;
  toName: string | null;
  fromName: string;
  company: string;
  site: string;
  count: number;
  message: string | null;
  link: string;
  expires: Date;
}) {
  const hi = opts.toName ? `Hi ${escapeHtml(opts.toName.split(" ")[0])},` : "Hi,";
  const body = `
    <p style="margin:0 0 12px 0;">${hi}</p>
    <p style="margin:0 0 12px 0;"><strong>${escapeHtml(opts.fromName)}</strong> from USI Computer is planning IT improvements for
      <strong>${escapeHtml(opts.company)}${opts.site ? ` — ${escapeHtml(opts.site)}` : ""}</strong> and needs a few details only your office would know.</p>
    ${opts.message ? `<p style="margin:0 0 12px 0;padding:12px 14px;background:#faf8f3;border-radius:8px;">${escapeHtml(opts.message).replace(/\n/g, "<br>")}</p>` : ""}
    <p style="margin:0;">It’s <strong>${opts.count} short question${opts.count === 1 ? "" : "s"}</strong> — no sign-in needed. Answer what you can and tick “I don’t know” for the rest; it saves as you go.</p>`;
  await sendEmail({
    to: opts.to,
    toName: opts.toName ?? undefined,
    subject: `A few quick questions about ${opts.site || opts.company}`,
    htmlBody: emailLayout(
      "A few quick questions",
      body,
      { label: "Answer the questions", href: opts.link },
      `This link is just for you and works until ${escapeHtml(fmt(opts.expires))}.`,
    ),
  });
}

export async function sendInfoRequestAnsweredEmail(opts: {
  to: string;
  recipient: string;
  site: string;
  answered: number;
  unknown: number;
  link: string;
}) {
  const body = `
    <p style="margin:0 0 12px 0;"><strong>${escapeHtml(opts.recipient)}</strong> answered your questions for <strong>${escapeHtml(opts.site)}</strong>.</p>
    <p style="margin:0;">${opts.answered} answered${opts.unknown ? `, ${opts.unknown} marked “don’t know”` : ""}. The answers are already on the site walk and the follow-ups are cleared.</p>`;
  await sendEmail({
    to: opts.to,
    subject: `${opts.recipient} answered the ${opts.site} questions`,
    htmlBody: emailLayout("Answers received", body, { label: "Review the answers", href: opts.link }, "DealScope site discovery"),
  });
}
