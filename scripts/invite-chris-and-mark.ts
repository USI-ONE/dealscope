/**
 * One-shot: null out the temp passwords I previously set on Chris + Mark,
 * insert fresh memberInvitations rows for them, and send the invitation
 * emails via Microsoft Graph.
 *
 *   pnpm exec tsx scripts/invite-chris-and-mark.ts
 *
 * Inlines the Graph-send + HTML composition so we don't import any
 * "server-only" module under tsx.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { Client } from "pg";

const INVITATION_TTL_DAYS = 14;

const TENANT = process.env.MS_GRAPH_TENANT_ID!;
const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID!;
const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET!;
const FROM_EMAIL = process.env.INVITE_FROM_EMAIL!;
const BASE_URL = process.env.AUTH_URL ?? "http://localhost:3000";

for (const [k, v] of Object.entries({
  MS_GRAPH_TENANT_ID: TENANT,
  MS_GRAPH_CLIENT_ID: CLIENT_ID,
  MS_GRAPH_CLIENT_SECRET: CLIENT_SECRET,
  INVITE_FROM_EMAIL: FROM_EMAIL,
})) {
  if (!v) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  executive: "Executive",
  manager: "Manager",
  member: "Member",
  external_diligence: "External — Diligence only",
};

const ROLE_DESCRIPTION: Record<string, string> = {
  owner: "full access — can invite and remove members, change roles, and manage everything",
  executive: "read access across the platform with finance access",
  manager: "the ability to add and edit operational data (clients, hardware, services)",
  member: "view-only access by default",
  external_diligence: "access only to the Diligence section — no clients, vendors, finance, services, licenses, or settings",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getGraphToken(): Promise<string> {
  const r = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!r.ok) throw new Error(`Graph token: ${r.status} ${await r.text()}`);
  const data = (await r.json()) as { access_token: string };
  return data.access_token;
}

async function sendInvitationEmail(opts: {
  to: string;
  inviterName: string;
  role: string;
  baseUrl: string;
  token: string;
  expiresAt: Date;
}) {
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

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f1ea; padding:32px; color:#1a1a1a;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="padding:24px 28px 0 28px;">
        <div style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#458C5E;">TechOS</div>
        <h1 style="font-size:20px; font-weight:700; margin:8px 0 0 0;">You've been invited</h1>
      </div>
      <div style="padding:18px 28px 24px 28px; font-size:15px; line-height:1.55;">
        <p style="margin:0 0 12px 0;">
          <strong>${escapeHtml(opts.inviterName)}</strong> invited you to join
          <strong>TechOS</strong> as a <strong>${escapeHtml(roleLabel)}</strong>.
        </p>
        ${roleDescription ? `<p style="margin:0 0 12px 0; font-size:13px; color:#555;">That role gives you ${escapeHtml(roleDescription)}.</p>` : ""}
        <p style="margin:0 0 8px 0; font-size:14px;">
          Click the button below to accept the invitation and set a password.
          The link is unique to you and expires <strong>${escapeHtml(expiresLabel)}</strong>.
        </p>
        <p style="margin:18px 0 8px 0;">
          <a href="${escapeHtml(acceptUrl)}" style="display:inline-block; padding:10px 20px; background:#458C5E; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:600; font-size:14px;">
            Accept invitation
          </a>
        </p>
        <p style="margin:18px 0 0 0; font-size:12px; color:#777;">
          Or paste this link into your browser:<br/>
          <span style="color:#444;">${escapeHtml(acceptUrl)}</span>
        </p>
      </div>
      <div style="padding:14px 28px; background:#fafaf5; border-top:1px solid #ebe7dc; font-size:11px; color:#888;">
        Sent because you were invited as <strong>${escapeHtml(opts.to)}</strong>.
        If you don't recognize this, contact your IT team.
      </div>
    </div>
  </body>
</html>`;

  const token = await getGraphToken();
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(FROM_EMAIL)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: `${opts.inviterName} invited you to TechOS`,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: opts.to } }],
          from: { emailAddress: { address: FROM_EMAIL } },
        },
        saveToSentItems: true,
      }),
    },
  );
  if (!r.ok) throw new Error(`Graph sendMail: ${r.status} ${await r.text()}`);
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const org = await c.query(`SELECT id FROM organizations WHERE name = 'Universal Systems Inc' LIMIT 1`);
  const orgId = org.rows[0].id;

  // Find the inviter (Chris Wall, owner) so we have a membership id +
  // display name to put on the invitation row + the email "From ... invited you".
  const inviter = await c.query(`
    SELECT u.name AS name, u.email AS email, m.id AS membership_id
      FROM memberships m
      JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.role = 'owner' AND m.is_active = TRUE
     ORDER BY m.created_at LIMIT 1
  `, [orgId]);
  const inviterMembershipId = inviter.rows[0].membership_id;
  const inviterName = inviter.rows[0].name ?? inviter.rows[0].email;

  const targets = [
    { email: "chriss@usicomputer.com", role: "manager", financeAccess: true },
    { email: "markf@usicomputer.com", role: "manager", financeAccess: true },
  ];

  console.log(`\nUsing inviter: ${inviterName}`);
  console.log(`Base URL for invitation links: ${BASE_URL}\n`);

  for (const t of targets) {
    // 1. Null out the password on any existing user record so the only
    //    path in is via the invitation link.
    const upd = await c.query(
      `UPDATE users SET password_hash = NULL, must_change_password = FALSE WHERE lower(email) = $1`,
      [t.email],
    );
    if (upd.rowCount && upd.rowCount > 0) {
      console.log(`  cleared old password for ${t.email}`);
    }

    // 2. Soft-revoke any prior pending invitations for the same email.
    await c.query(
      `DELETE FROM member_invitations
        WHERE organization_id = $1 AND lower(email) = $2 AND consumed_at IS NULL`,
      [orgId, t.email],
    );

    // 3. Insert a fresh invitation row.
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const insert = await c.query(
      `INSERT INTO member_invitations
         (organization_id, email, role, finance_access, invited_by_membership_id,
          expires_at, last_email_sent_at, email_send_attempt_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 1, NOW(), NOW())
       RETURNING id`,
      [orgId, t.email, t.role, t.financeAccess, inviterMembershipId, expiresAt],
    );
    const id = insert.rows[0].id;
    console.log(`  invitation row created  → ${id}`);

    // 4. Send the email.
    try {
      await sendInvitationEmail({
        to: t.email,
        inviterName,
        role: t.role,
        baseUrl: BASE_URL,
        token: id,
        expiresAt,
      });
      console.log(`  ✓ email sent to ${t.email}`);
      console.log(`    link: ${BASE_URL.replace(/\/$/, "")}/invite/${id}\n`);
    } catch (e) {
      console.log(`  ✗ email send failed: ${(e as Error).message}`);
      await c.query(
        `UPDATE member_invitations SET last_email_error = $1, updated_at = NOW() WHERE id = $2`,
        [(e as Error).message.slice(0, 1000), id],
      );
    }
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
