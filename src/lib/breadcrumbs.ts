/**
 * Header breadcrumb trail for a path. Used for the first server render and
 * re-resolved by the client on every navigation (the (app) layout doesn't
 * re-render on client-side navigation, so its own copy would go stale).
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { diligenceEngagements, diligenceSessions, discoveryProjects } from "@/db/schema";

export type BreadcrumbSegment = { label: string; href?: string };

const SUB_PAGE_LABELS: Record<string, string> = {
  briefing: "Briefing",
  compliance: "Compliance",
  report: "Report",
  sessions: "Sessions",
};

const SETTINGS_LABELS: Record<string, string> = {
  members: "Members",
  account: "My Account",
  organization: "Organization",
};

export async function buildBreadcrumbs(
  path: string,
  orgId: string,
): Promise<BreadcrumbSegment[]> {
  try {
    if (path.startsWith("/settings")) {
      const segment = path.split("/")[2];
      const crumbs: BreadcrumbSegment[] = [{ label: "Settings", href: "/settings/account" }];
      if (segment && SETTINGS_LABELS[segment]) {
        crumbs.push({ label: SETTINGS_LABELS[segment] });
      }
      return crumbs;
    }

    if (path.startsWith("/discovery")) {
      const crumbs: BreadcrumbSegment[] = [{ label: "Site discovery", href: "/discovery" }];
      const m = path.match(/^\/discovery\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) {
        const project = await db.query.discoveryProjects.findFirst({
          where: and(eq(discoveryProjects.id, m[1]), eq(discoveryProjects.organizationId, orgId)),
          columns: { name: true },
        });
        if (project) crumbs.push({ label: project.name, href: `/discovery/${m[1]}` });
      }
      return crumbs;
    }

    if (path.startsWith("/diligence")) {
      const crumbs: BreadcrumbSegment[] = [
        { label: "Engagements", href: "/diligence" },
      ];

      const engMatch = path.match(/^\/diligence\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (!engMatch) return crumbs;

      const engId = engMatch[1];
      const engagement = await db.query.diligenceEngagements.findFirst({
        where: and(
          eq(diligenceEngagements.id, engId),
          eq(diligenceEngagements.organizationId, orgId),
        ),
        columns: { targetCompanyName: true },
      });
      if (!engagement) return crumbs;

      crumbs.push({ label: engagement.targetCompanyName, href: `/diligence/${engId}` });

      // Session detail: /diligence/[id]/sessions/[sid]
      const sessionMatch = path.match(/\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (sessionMatch) {
        const session = await db.query.diligenceSessions.findFirst({
          where: and(
            eq(diligenceSessions.id, sessionMatch[1]),
            eq(diligenceSessions.engagementId, engId),
          ),
          columns: { title: true },
        });
        crumbs.push({ label: "Sessions", href: `/diligence/${engId}?tab=sessions` });
        if (session) crumbs.push({ label: session.title });
        return crumbs;
      }

      // Other sub-pages
      const subPage = path.split("/")[3];
      if (subPage && SUB_PAGE_LABELS[subPage]) {
        crumbs.push({ label: SUB_PAGE_LABELS[subPage] });
      }

      return crumbs;
    }

    return [];
  } catch {
    // Never block render on breadcrumb failure
    return [];
  }
}

