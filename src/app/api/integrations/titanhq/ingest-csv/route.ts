/**
 * POST /api/integrations/titanhq/ingest-csv
 *
 * Accepts a multipart upload of a TitanHQ Platform "License Usage by
 * Customer" CSV (downloadable from platform.titanhq.com/msp → License
 * Usage → Export). Parses + persists into vendor_seat_snapshots so the
 * data flows through to the PS monthly invoice composer.
 *
 * Form fields:
 *   csv        — the file (required)
 *   product    — "email_security" | "phishing_simulation" |
 *                "security_awareness_training" (defaults to
 *                email_security)
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import {
  ingestTitanHqCsv,
  type TitanHqCsvProduct,
} from "@/lib/integrations/titanhq/csv-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const file = form?.get("csv");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "csv field is required" },
      { status: 400 },
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "CSV too large (>5 MB)" }, { status: 413 });
  }
  const productRaw = form?.get("product");
  const product: TitanHqCsvProduct =
    productRaw === "phishing_simulation" ||
    productRaw === "security_awareness_training"
      ? productRaw
      : "email_security";

  const text = await file.text();
  try {
    const result = await ingestTitanHqCsv({
      organizationId: ctx.organization.id,
      csvText: text,
      product,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
