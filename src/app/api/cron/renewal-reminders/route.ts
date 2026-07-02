/**
 * Weekly 30-day renewal digest cron.
 *
 * Runs Mondays 13:00 UTC (08:00 ET-ish, before the work week starts in
 * earnest). For each org, computes the list of licenses + subscriptions
 * + domains renewing in the next 30 days and emails the digest to:
 *   - the configured INVITE_FROM_EMAIL (admin's inbox)
 *   - any item-level owners CC'd on rows they own (deduped)
 *
 * Implements the rock's "30-day renewal reminder process implemented"
 * milestone. Falls back to a no-op log line if Microsoft Graph
 * Mail.Send permission isn't granted yet — the report still appears
 * on /audit so nothing is missed.
 *
 * Auth: same model as the snapshot-tiers cron (Bearer CRON_SECRET +
 * x-vercel-cron header in prod; permissive in dev).
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { upcomingRenewals, type AuditItem } from "@/lib/audit/inventory";
import { sendEmail, isEmailConfigured } from "@/lib/email/graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const ms = new Date(`${d}T00:00:00Z`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

const KIND_LABEL: Record<AuditItem["kind"], string> = {
  license: "License",
  subscription: "Subscription",
  domain: "Domain",
};

function buildDigestHtml(orgName: string, items: AuditItem[]): string {
  const rows = items
    .map((i) => {
      const days = daysUntil(i.renewalDate) ?? 0;
      const urgent = days <= 7;
      const dayColor = urgent ? "#b91c1c" : "#92400e";
      return `<tr>
        <td style="padding:6px 8px; font-size:12px; border-bottom:1px solid #ebe7dc;">${escapeHtml(i.renewalDate ?? "—")}</td>
        <td style="padding:6px 8px; font-size:12px; border-bottom:1px solid #ebe7dc; color:${dayColor}; font-weight:600;">${days <= 0 ? "due / overdue" : `${days}d`}</td>
        <td style="padding:6px 8px; font-size:12px; border-bottom:1px solid #ebe7dc;">${escapeHtml(KIND_LABEL[i.kind])}</td>
        <td style="padding:6px 8px; font-size:12px; border-bottom:1px solid #ebe7dc;"><strong>${escapeHtml(i.name)}</strong>${i.detail ? `<br/><span style="color:#666; font-size:11px;">${escapeHtml(i.detail)}</span>` : ""}</td>
        <td style="padding:6px 8px; font-size:12px; border-bottom:1px solid #ebe7dc;">${escapeHtml(i.clientName ?? "—")}</td>
        <td style="padding:6px 8px; font-size:12px; border-bottom:1px solid #ebe7dc;">${escapeHtml(i.vendorName ?? "—")}</td>
        <td style="padding:6px 8px; font-size:12px; border-bottom:1px solid #ebe7dc;">${i.billable ? "Yes" : "—"}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f1ea; padding:24px; color:#1a1a1a;">
    <div style="max-width:760px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="padding:20px 28px 0 28px;">
        <div style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#458C5E;">TechOS</div>
        <h1 style="font-size:18px; font-weight:700; margin:6px 0 0 0;">Renewals in the next 30 days — ${escapeHtml(orgName)}</h1>
        <p style="margin:6px 0 0 0; font-size:13px; color:#555;">
          ${items.length} item${items.length === 1 ? "" : "s"} renewing or expiring soon. Open the audit dashboard for the full inventory + status.
        </p>
      </div>
      <div style="padding:14px 28px 24px 28px;">
        <table style="width:100%; border-collapse:collapse; background:#fff;">
          <thead>
            <tr style="background:#fafaf5;">
              <th style="padding:6px 8px; font-size:11px; text-align:left; color:#666; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #ebe7dc;">Renews</th>
              <th style="padding:6px 8px; font-size:11px; text-align:left; color:#666; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #ebe7dc;">In</th>
              <th style="padding:6px 8px; font-size:11px; text-align:left; color:#666; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #ebe7dc;">Kind</th>
              <th style="padding:6px 8px; font-size:11px; text-align:left; color:#666; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #ebe7dc;">Item</th>
              <th style="padding:6px 8px; font-size:11px; text-align:left; color:#666; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #ebe7dc;">Client</th>
              <th style="padding:6px 8px; font-size:11px; text-align:left; color:#666; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #ebe7dc;">Vendor</th>
              <th style="padding:6px 8px; font-size:11px; text-align:left; color:#666; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #ebe7dc;">Billable</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="padding:14px 28px; background:#fafaf5; border-top:1px solid #ebe7dc; font-size:11px; color:#888;">
        Generated automatically by TechOS. Manage owners + audit stamps at /audit.
      </div>
    </div>
  </body>
</html>`;
}

export async function GET(req: NextRequest) {
  const provided = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  const fromVercelCron = req.headers.get("x-vercel-cron") !== null;
  const authorized =
    (expected && provided === expected) ||
    fromVercelCron ||
    process.env.NODE_ENV !== "production";
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  const results: Array<{
    orgId: string;
    orgName: string;
    itemCount: number;
    recipients: string[];
    emailStatus: "sent" | "skipped_empty" | "skipped_unconfigured" | "failed";
    error?: string;
  }> = [];

  for (const org of orgs) {
    const items = await upcomingRenewals(org.id, 30);
    if (items.length === 0) {
      results.push({
        orgId: org.id,
        orgName: org.name,
        itemCount: 0,
        recipients: [],
        emailStatus: "skipped_empty",
      });
      continue;
    }

    if (!isEmailConfigured()) {
      results.push({
        orgId: org.id,
        orgName: org.name,
        itemCount: items.length,
        recipients: [],
        emailStatus: "skipped_unconfigured",
      });
      continue;
    }

    // Resolve owner emails — owners with rows in the digest get CC'd.
    const ownerMembershipIds = Array.from(
      new Set(items.map((i) => i.ownerMembershipId).filter((x): x is string => !!x)),
    );
    let recipientEmails: string[] = [];
    if (ownerMembershipIds.length > 0) {
      const ownerRows = await db
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(
          and(
            eq(memberships.organizationId, org.id),
            inArray(memberships.id, ownerMembershipIds),
          ),
        );
      recipientEmails = ownerRows.map((r) => r.email);
    }
    // Always cc the configured INVITE_FROM_EMAIL (admin inbox).
    const primary = process.env.INVITE_FROM_EMAIL!;

    const html = buildDigestHtml(org.name, items);
    try {
      await sendEmail({
        to: primary,
        cc: recipientEmails.length > 0 ? recipientEmails : undefined,
        subject: `[TechOS] ${items.length} renewal${items.length === 1 ? "" : "s"} in next 30d — ${org.name}`,
        htmlBody: html,
      });
      results.push({
        orgId: org.id,
        orgName: org.name,
        itemCount: items.length,
        recipients: [primary, ...recipientEmails],
        emailStatus: "sent",
      });
    } catch (e) {
      results.push({
        orgId: org.id,
        orgName: org.name,
        itemCount: items.length,
        recipients: [primary, ...recipientEmails],
        emailStatus: "failed",
        error: (e as Error).message.slice(0, 500),
      });
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), orgs: results });
}
