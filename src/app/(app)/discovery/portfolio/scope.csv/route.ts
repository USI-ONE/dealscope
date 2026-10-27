/** GET /discovery/portfolio/scope.csv?ids=a,b — every selected site's install scope, one sales order per site. */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { discoveryProjects } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { loadPortfolio } from "@/lib/discovery/assessment-store";
import { baseCustomer } from "@/lib/discovery/assessment";
import { loadScope } from "@/lib/discovery/scope";
import { csvResponse, ORDER_HEADER, orderRows, toCsv } from "@/lib/discovery/scope-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await requireRole("member");
  const requested = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const walks = await db
    .select({ id: discoveryProjects.id, status: discoveryProjects.status })
    .from(discoveryProjects)
    .where(
      and(
        eq(discoveryProjects.organizationId, ctx.organization.id),
        isNull(discoveryProjects.archivedAt),
        requested.length ? inArray(discoveryProjects.id, requested) : undefined,
      ),
    );
  const ids = requested.length ? walks.map((w) => w.id) : walks.filter((w) => w.status === "review" || w.status === "complete").map((w) => w.id);
  const { assessments } = await loadPortfolio(ctx.organization.id, ids);
  const date = new Date().toISOString().slice(0, 10);
  const rows = [ORDER_HEADER];
  for (const a of [...assessments].sort((x, y) => x.site.localeCompare(y.site))) {
    const { lines } = await loadScope(ctx.organization.id, a.projectId);
    rows.push(...orderRows({ customer: baseCustomer(a.customer), site: a.site, lines, date }).map((r) => r.map(String)));
  }
  return csvResponse(toCsv(rows), `install-scope-all-sites-${date}.csv`);
}
