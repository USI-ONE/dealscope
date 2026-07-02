/**
 * POST /api/integrations/license-count-xlsx/ingest
 *
 * Accepts a monthly License Count xlsx (USI's hand-curated workbook on
 * SharePoint) as a multipart upload. Parses + writes per-(client × column)
 * snapshots into vendor_seat_snapshots, routing each recognized column to
 * the matching vendor_connections row.
 *
 * Form fields:
 *   xlsx          — the file (required)
 *   periodLabel   — optional, e.g. "Nov 2025" or "01-12-2026". Written
 *                   into last_sync_message for audit.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { ingestLicenseCountXlsx } from "@/lib/integrations/license-count-xlsx/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await requireContext();
  if (
    !can("update", "organization", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("xlsx");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "xlsx field is required" },
      { status: 400 },
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "xlsx too large (>10 MB)" }, { status: 413 });
  }
  const periodLabel = form?.get("periodLabel");
  const periodLabelStr =
    typeof periodLabel === "string" && periodLabel.length > 0
      ? periodLabel
      : undefined;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await ingestLicenseCountXlsx({
      organizationId: ctx.organization.id,
      buffer: buf,
      periodLabel: periodLabelStr,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
