/**
 * POST /api/finance/bills/[id]/extract
 *
 * Accepts a PDF upload (multipart/form-data, field name "pdf") and uses
 * Claude's native PDF input to extract line items from the vendor bill.
 *
 * Returns a structured JSON envelope:
 *
 *   {
 *     summary: { vendor, invoiceNumber, periodStart, periodEnd, totalCents },
 *     lines: [
 *       { description, sku, quantity, unitCostCents, totalCents,
 *         periodStart, periodEnd, confidence }
 *     ],
 *     warnings: string[]
 *   }
 *
 * Does NOT auto-persist lines. The UI shows the extraction to the
 * operator for review; the existing createBillLine action is what
 * actually writes rows. This keeps the AI honest — the human always
 * approves before billing math is committed.
 *
 * PDF storage: by design, we DON'T persist the original PDF anywhere.
 * The audit trail is the bill row's `extraction_metadata_json` blob
 * + the SHA-256 of the file (so the same upload can be detected on
 * re-extract). When you decide to add blob storage later, drop the
 * upload into Vercel Blob / S3 here and set `pdfBlobUrl` on the bill.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vendorBills } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { AI_MODEL, getAnthropic, isAiConfigured } from "@/lib/ai/anthropic";
import { createHash } from "crypto";

export const runtime = "nodejs";
// PDFs + Claude response can take a minute. Bump the timeout from the
// default 60s on Vercel Hobby; Pro accounts default to 5 min.
export const maxDuration = 300;

const extractionSchema = z.object({
  summary: z.object({
    vendor: z.string().nullable(),
    invoiceNumber: z.string().nullable(),
    periodStart: z.string().nullable(), // YYYY-MM-DD
    periodEnd: z.string().nullable(),
    totalCents: z.number().int().nullable(),
  }),
  lines: z
    .array(
      z.object({
        description: z.string(),
        sku: z.string().nullable(),
        quantity: z.number().int().nullable(),
        unitCostCents: z.number().int().nullable(),
        totalCents: z.number().int(),
        periodStart: z.string().nullable(),
        periodEnd: z.string().nullable(),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(500),
  warnings: z.array(z.string()).default([]),
});

export type BillExtraction = z.infer<typeof extractionSchema>;

export async function POST(
  req: NextRequest,
  ctxArg: { params: Promise<{ id: string }> },
) {
  const { id: billId } = await ctxArg.params;
  const ctx = await requireContext();
  if (!can("update", "bill", {
    role: ctx.membership.role,
    financeAccess: ctx.membership.financeAccess,
  })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI not configured (ANTHROPIC_API_KEY)" },
      { status: 503 },
    );
  }

  const bill = await db.query.vendorBills.findFirst({
    where: and(
      eq(vendorBills.id, billId),
      eq(vendorBills.organizationId, ctx.organization.id),
    ),
  });
  if (!bill) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("pdf");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "pdf field is required" }, { status: 400 });
  }
  if (!file.type.includes("pdf")) {
    return NextResponse.json(
      { error: `Expected application/pdf, got ${file.type}` },
      { status: 400 },
    );
  }
  // 25 MB ceiling — Anthropic accepts up to 32 MB but our bills are
  // never that large, and tighter caps protect us from runaway uploads.
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF too large (>25 MB)" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");

  // Mark extraction in progress so the UI can show a spinner if it
  // polls. (Not currently used — the request is synchronous.)
  await db
    .update(vendorBills)
    .set({
      extractionStatus: "in_progress",
      updatedAt: new Date(),
    })
    .where(eq(vendorBills.id, billId));

  const anthropic = getAnthropic();
  let extraction: BillExtraction;
  try {
    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: buf.toString("base64"),
              },
            },
            {
              type: "text",
              text: USER_PROMPT,
            },
          ],
        },
      ],
    });

    const text = message.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const json = extractJsonBlock(text);
    const parsed = extractionSchema.safeParse(json);
    if (!parsed.success) {
      await db
        .update(vendorBills)
        .set({
          extractionStatus: "failed",
          extractionMetadataJson: {
            error: "schema_mismatch",
            issues: parsed.error.flatten(),
            rawText: text.slice(0, 2000),
          },
          updatedAt: new Date(),
        })
        .where(eq(vendorBills.id, billId));
      return NextResponse.json(
        {
          error: "extraction_schema_mismatch",
          issues: parsed.error.flatten(),
          rawText: text.slice(0, 2000),
        },
        { status: 422 },
      );
    }
    extraction = parsed.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(vendorBills)
      .set({
        extractionStatus: "failed",
        extractionMetadataJson: { error: "api_error", message },
        updatedAt: new Date(),
      })
      .where(eq(vendorBills.id, billId));
    return NextResponse.json({ error: "extraction_failed", message }, { status: 500 });
  }

  // Success — stash the extraction blob + file metadata on the bill so
  // the audit trail is complete even before lines are persisted.
  await db
    .update(vendorBills)
    .set({
      extractionStatus: "extracted",
      extractionMetadataJson: {
        ...extraction,
        fileMetadata: {
          filename: file.name,
          sizeBytes: file.size,
          sha256,
          extractedAt: new Date().toISOString(),
        },
      },
      pdfFilename: file.name,
      updatedAt: new Date(),
    })
    .where(eq(vendorBills.id, billId));

  return NextResponse.json(extraction);
}

/* ============================================================================
 * Prompts
 * ========================================================================== */
const SYSTEM_PROMPT = `You are TechOS Bill Extraction, a careful invoice-OCR partner for an MSP. You read a vendor PDF invoice and emit a strictly-typed JSON object describing the invoice header + every line item.

Rules:
- Read the entire PDF before deciding what to emit.
- Never invent line items. If you can't tell from the document, leave the field null.
- All money amounts are integers in CENTS, never dollars or floats.
- Quantity is an integer count (seats, units, devices). Null when the line is a flat charge.
- Dates are YYYY-MM-DD. If only a month is shown (e.g. "April 2025"), set periodStart to the first of that month and periodEnd to the last of that month.
- Confidence is "high" when the field is printed plainly, "medium" when inferred from context, "low" when guessed.
- Skip subtotal / tax / total summary rows — they belong in summary.totalCents, not lines.
- Include credits / negative line items with negative totalCents.
- Group SKUs that repeat on the invoice into a single line with a summed quantity, UNLESS they have different periods.
- Output ONLY a single JSON object wrapped in a \`\`\`json fenced block. No prose before or after.`;

const USER_PROMPT = `Extract this invoice into the structured JSON envelope. Return your answer as a single JSON object inside a \`\`\`json fenced code block. Schema:

\`\`\`json
{
  "summary": {
    "vendor": "string | null — vendor's display name on the invoice",
    "invoiceNumber": "string | null",
    "periodStart": "YYYY-MM-DD | null",
    "periodEnd": "YYYY-MM-DD | null",
    "totalCents": "integer | null — invoice total in CENTS"
  },
  "lines": [
    {
      "description": "string — human-friendly description of the line",
      "sku": "string | null — vendor SKU / part number",
      "quantity": "integer | null",
      "unitCostCents": "integer | null",
      "totalCents": "integer — line total in CENTS (signed)",
      "periodStart": "YYYY-MM-DD | null",
      "periodEnd": "YYYY-MM-DD | null",
      "confidence": "high | medium | low"
    }
  ],
  "warnings": ["short notes for the operator — fields you couldn't infer, math that didn't reconcile, scans you couldn't read, etc."]
}
\`\`\`
`;

/** Pull the first fenced ```json block out of Claude's response. */
function extractJsonBlock(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  return JSON.parse(body);
}

// Re-import Anthropic types for the content filter above without
// triggering circular imports.
import type Anthropic from "@anthropic-ai/sdk";
