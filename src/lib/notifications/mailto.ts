/**
 * mailto: URL builder.
 *
 * We deliberately don't auto-send email — the user clicks a button that
 * opens their own mail client with the message pre-filled. That way:
 *   - No SMTP / API key configuration required
 *   - Mail comes from the user's real mailbox (better auth + deliverability)
 *   - Their Sent folder is the source of truth for actual sends
 *
 * We pair every mailto: click with a server action that records the
 * trigger (to / subject / channel + timestamp + by-membership) so the
 * audit trail captures intent even if the user never actually sends.
 */
export type MailtoInput = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body: string;
};

export function buildMailto({ to, cc, bcc, subject, body }: MailtoInput): string {
  const toList = Array.isArray(to) ? to.join(",") : to;
  const params = new URLSearchParams();
  if (cc) params.set("cc", Array.isArray(cc) ? cc.join(",") : cc);
  if (bcc) params.set("bcc", Array.isArray(bcc) ? bcc.join(",") : bcc);
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  // RFC 6068: comma between addresses, encoded; URLSearchParams does the
  // rest of the encoding. Don't URL-encode the address list — most mail
  // clients accept raw "@" in the path segment after mailto:.
  const qs = params.toString().replace(/\+/g, "%20");
  return `mailto:${toList}${qs ? `?${qs}` : ""}`;
}

/** Convenience — strings into a multi-paragraph email body with proper
 *  paragraph breaks. mailto: bodies use real newlines (the spec says
 *  CRLF, but %0A works everywhere). */
export function emailBody(...paragraphs: Array<string | null | undefined>): string {
  return paragraphs
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join("\n\n");
}
