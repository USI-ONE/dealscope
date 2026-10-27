/** GET /discovery/[id]/scope.csv — this site's install scope as QuickBooks sales-order lines. */
import { requireRole } from "@/lib/auth-helpers";
import { baseCustomer } from "@/lib/discovery/assessment";
import { getProject, walkSiteName } from "@/lib/discovery/load";
import { loadScope } from "@/lib/discovery/scope";
import { csvResponse, ORDER_HEADER, orderRows, qbDate, slug, toCsv } from "@/lib/discovery/scope-export";
import { db } from "@/db";
import { discoveryAnswers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctxArg: { params: Promise<{ id: string }> }) {
  const { id } = await ctxArg.params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) return new Response("Not found", { status: 404 });
  const [{ lines }, site, client] = await Promise.all([
    loadScope(ctx.organization.id, project.id),
    walkSiteName(project.id, ctx.organization.id),
    db.query.discoveryAnswers.findFirst({
      where: and(eq(discoveryAnswers.projectId, project.id), eq(discoveryAnswers.questionKey, "cover.client_name")),
      columns: { value: true },
    }),
  ]);
  const name = site || project.name;
  const unpriced = lines.filter((l) => l.included && l.category !== "By others" && l.priceCents == null).length;
  if (unpriced)
    return new Response(`${unpriced} line(s) on the ${name} scope have no price. Prices are set on each sales order — enter them on the Install scope tab, then export.`, {
      status: 409,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  const customer = baseCustomer(typeof client?.value?.v === "string" ? client.value.v : "");
  const { date, mmdd } = qbDate();
  return csvResponse(toCsv([ORDER_HEADER, ...orderRows({ customer, site: name, lines, date, mmdd })]), `sales-order-${slug(name)}.csv`);
}
