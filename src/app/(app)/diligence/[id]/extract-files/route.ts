/**
 * POST /diligence/[id]/extract-files
 *
 * Accepts a multipart upload of one or more files (PDF / DOCX / XLSX /
 * PPTX / CSV / TXT) plus optional accompanying notes, sends them to Claude
 * with the diligence question catalog, and returns proposals in the
 * same shape as `extractAnswersFromNotes`. The client merges the
 * proposals into the existing review UI — nothing persists from this
 * call.
 *
 * Why a route handler rather than a safe-action: file uploads are
 * cleanest as multipart/form-data, and we want to keep the per-request
 * memory footprint bounded by streaming the body through `formData()`
 * rather than serializing all the bytes into a server-action argument.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  AI_MODEL,
  buildSystemPrompt,
  getAnthropic,
  loadEngagementContext,
  type ExtractedAnswer,
} from "@/lib/ai/anthropic";
import { requirePermission } from "@/lib/auth-helpers";
import { extractFiles, type FilePart } from "@/lib/diligence/file-extract";

export const runtime = "nodejs";
export const maxDuration = 300; // PDF reads can take a bit

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposals", "notesAboutSession"],
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionKey", "value", "evidence", "confidence"],
        properties: {
          questionKey: { type: "string" },
          value: {
            anyOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { type: "array", items: { type: "string" } },
              { type: "null" },
            ],
          },
          evidence: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    notesAboutSession: { type: "string" },
  },
} as const;

type ResponseBody =
  | {
      ok: true;
      proposals: ExtractedAnswer[];
      notesAboutSession: string;
      filesUsed: Array<{
        filename: string;
        kind: FilePart["kind"];
        reason?: string;
      }>;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
      };
    }
  | { ok: false; error: string };

export async function POST(
  req: Request,
  ctxArg: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctxArg.params;

  let ctx;
  try {
    ctx = await requirePermission("update", "diligence");
  } catch {
    return Response.json(
      { ok: false, error: "Not authorized" },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const accompanyingNotes = (formData.get("notes") as string | null) ?? "";
  const fileEntries = formData.getAll("files");
  const files: File[] = fileEntries.filter(
    (e): e is File => e instanceof File && e.size > 0,
  );

  if (files.length === 0 && accompanyingNotes.trim().length === 0) {
    return Response.json(
      { ok: false, error: "Upload at least one file (or paste notes)." },
      { status: 400 },
    );
  }

  // Engagement scope check + question catalog load.
  let context, questions;
  try {
    ({ context, questions } = await loadEngagementContext(
      id,
      ctx.organization.id,
    ));
  } catch {
    return Response.json(
      { ok: false, error: "Engagement not found" },
      { status: 404 },
    );
  }
  const validKeys = new Set(questions.map((q) => q.key));

  // Extract every file. PDFs become base64 doc blocks; everything else
  // becomes a labeled text fragment.
  const parts = await extractFiles(files);
  const skipped = parts.filter((p) => p.kind === "skipped");
  const extracted = parts.filter((p) => p.kind !== "skipped");
  if (extracted.length === 0 && accompanyingNotes.trim().length === 0) {
    return Response.json(
      {
        ok: false,
        error:
          skipped.length > 0
            ? `No supported files. ${skipped[0].kind === "skipped" ? skipped[0].reason : ""}`
            : "No content to extract from.",
      },
      { status: 400 },
    );
  }

  // Assemble the user message: instructions, then each file as either a
  // document block (PDF) or a text block, then any free-form notes.
  const intro = `# Task: Extract structured answers from these source documents

You're being given ${extracted.length} attached file(s)${accompanyingNotes.trim() ? " plus free-form notes" : ""} from a diligence engagement on ${context.targetCompanyName}. Read everything, then for each question in the catalog where the source contains a direct or strongly-implied answer, return a proposal with:
- questionKey from the catalog (must match exactly — proposals with unknown keys will be discarded)
- value matching the question kind:
    text/longtext -> string
    yes_no -> boolean
    number -> number (in the unit the question specifies)
    select -> string from options
    multiselect -> string[] from options
- evidence: a short verbatim excerpt naming the source file ("From SCR Device Inventory.csv: ...")
- confidence: high (explicit answer), medium (clear inference), low (ambiguous — interviewer should review)

Skip questions the sources don't address. Don't fabricate. When extracting from inventories or other technical documents, derive aggregate facts (counts, distributions, EOL flags) where the question asks for them.

Also include a short "notesAboutSession" — 1-3 sentences flagging anything notable: contradictions, follow-ups worth chasing, things you saw that aren't in the catalog.`;

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: intro },
  ];

  for (const p of extracted) {
    if (p.kind === "pdf") {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: p.base64,
        },
        title: p.filename,
      } as Anthropic.ContentBlockParam);
    } else if (p.kind === "text") {
      content.push({ type: "text", text: p.text });
    }
  }

  if (accompanyingNotes.trim().length > 0) {
    content.push({
      type: "text",
      text: `# Additional interviewer notes\n\n${accompanyingNotes.trim()}`,
    });
  }

  // Call Claude.
  const client = getAnthropic();
  let result;
  try {
    result = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: EXTRACT_SCHEMA },
      },
      system: buildSystemPrompt(questions, context),
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? `AI call failed: ${err.message}`
            : "AI call failed",
      },
      { status: 502 },
    );
  }

  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return Response.json(
      { ok: false, error: "AI did not return a parseable response" },
      { status: 502 },
    );
  }

  let parsed: { proposals: ExtractedAnswer[]; notesAboutSession: string };
  try {
    const raw = textBlock.text.trim();
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s === -1 || e <= s) throw new Error("no JSON object");
    parsed = JSON.parse(raw.slice(s, e + 1));
  } catch {
    return Response.json(
      { ok: false, error: "AI response was not valid JSON" },
      { status: 502 },
    );
  }

  const proposals = parsed.proposals.filter((p) => validKeys.has(p.questionKey));

  return Response.json({
    ok: true,
    proposals,
    notesAboutSession: parsed.notesAboutSession ?? "",
    filesUsed: parts.map((p) => ({
      filename: p.filename,
      kind: p.kind,
      ...(p.kind === "skipped" ? { reason: p.reason } : {}),
    })),
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0,
    },
  });
}
