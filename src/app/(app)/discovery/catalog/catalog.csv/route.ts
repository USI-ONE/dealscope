/** GET /discovery/catalog/catalog.csv — the price list as a QuickBooks Products & Services import. */
import { requireRole } from "@/lib/auth-helpers";
import { loadCatalog } from "@/lib/discovery/scope";
import { catalogRows, csvResponse, toCsv } from "@/lib/discovery/scope-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireRole("member");
  return csvResponse(toCsv(catalogRows(await loadCatalog(ctx.organization.id))), "quickbooks-products-services.csv");
}
