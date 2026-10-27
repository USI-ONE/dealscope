/** GET /discovery/portfolio/scope.csv?ids=a,b — every selected site's install scope, one sales order per site. */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { discoveryProjects } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { loadPortfolio } from "@/lib/discovery/assessment-store";
import { baseCustomer } from "@/lib/discovery/assessment";
import { loadScope } from "@/lib/discovery/scope";
import { csvResponse, ORDER_HEADER, orderRows, qbDate, toCsv } from "@/lib/discovery/scope-export";

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
  const { date, mmdd } = qbDate();
  const rows = [ORDER_HEADER];
  const missing: string[] = [];
  for (const a of [...assessments].sort((x, y) => x.site.localeCompare(y.site))) {
    const { lines, totals } = await loadScope(ctx.organization.id, a.projectId);
    if (!lines.length) continue;
    if (totals.unpriced) {
      missing.push(`${a.site} (${totals.unpriced})`);
      continue;
    }
    rows.push(...orderRows({ customer: baseCustomer(a.customer), site: a.site, lines, date, mmdd }).map((r) => r.map(String)));
  }
  if (missing.length)
    return new Response(`Prices are set on each sales order. These scopes still have unpriced lines: ${missing.join(", ")}.`, {
      status: 409,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  return csvResponse(toCsv(rows), `sales-orders-all-sites-${mmdd}.csv`);
}
