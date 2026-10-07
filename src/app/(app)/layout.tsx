// All routes under (app) require auth and DB — never statically render.
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { diligenceEngagements, diligenceSessions, discoveryProjects } from "@/db/schema";
import { AppHeader } from "@/components/nav/app-header";
import { AppSidebar } from "@/components/nav/app-sidebar";
import { canCtx, getActiveContext } from "@/lib/auth-helpers";
import { isExternalRole } from "@/lib/rbac";

type BreadcrumbSegment = { label: string; href?: string };

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

async function buildBreadcrumbs(
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

/**
 * Routes an external_diligence guest is allowed to see. Anything else
 * redirects them to /diligence so they don't even glimpse other sections
 * of the app exist.
 */
const EXTERNAL_DILIGENCE_ALLOWED_PREFIXES = ["/diligence", "/sign-in"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getActiveContext();
  if (!context) redirect("/sign-in");

  const canSeeFinance = canCtx("read", "finance", context);
  const externalDiligence = isExternalRole(context.membership.role);

  const h = await headers();
  const path = h.get("x-pathname") || h.get("x-invoke-path") || "";

  // Hard guard: external_diligence guests can ONLY see /diligence/*.
  if (externalDiligence) {
    if (
      path &&
      !EXTERNAL_DILIGENCE_ALLOWED_PREFIXES.some((p) => path.startsWith(p))
    ) {
      redirect("/diligence");
    }
  }

  const breadcrumbs = await buildBreadcrumbs(path, context.organization.id);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        canSeeFinance={canSeeFinance}
        externalDiligence={externalDiligence}
        user={{
          name: context.user.name,
          email: context.user.email,
          role: context.membership.role,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader context={context} breadcrumbs={breadcrumbs} />
        {/* Field (discovery) pages: no overflow on main, so the page itself
            scrolls — position:sticky works and iOS keeps native scrolling.
            Everywhere else keeps main as the scroll container so existing
            wide tables still scroll horizontally. */}
        <main
          className={
            path.startsWith("/discovery")
              ? "min-w-0 flex-1 p-4 md:p-7 print:p-0"
              : "flex-1 overflow-y-auto p-4 md:p-7"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
