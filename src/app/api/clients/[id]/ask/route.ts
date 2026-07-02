/**
 * POST /api/clients/[id]/ask
 *
 * Per-client AI assistant. Answers natural-language questions about a
 * single client using ONLY that client's data — never another client's,
 * never generic Claude knowledge unless explicitly framed as "best
 * practice".
 *
 * Streams the response back as plain text so the client UI can render
 * tokens as they arrive.
 *
 * Hard scoping guarantees (defense in depth):
 *  1. URL path declares the client_id; we validate it belongs to the
 *     caller's organization. If not, 404 — never reveal another org's
 *     existence.
 *  2. loadClientAiContext() filters every underlying query by client_id
 *     = X. No other client's data can possibly land in the context.
 *  3. The system prompt explicitly states the assistant only knows
 *     about ONE client (by name) and must refuse cross-client questions.
 *  4. The user message never reaches Claude raw — it's wrapped in a
 *     scaffold that re-asserts the scope right before the question.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { canCtx, requireContext } from "@/lib/auth-helpers";
import { AI_MODEL, getAnthropic, isAiConfigured } from "@/lib/ai/anthropic";
import { loadClientAiContext } from "@/lib/ai/client-context";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
      }),
    )
    .max(20)
    .default([]),
});

export async function POST(
  req: NextRequest,
  ctxArg: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await ctxArg.params;
  const ctx = await requireContext();
  if (!canCtx("read", "client", ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI not configured (ANTHROPIC_API_KEY)" },
      { status: 503 },
    );
  }

  // Validate the client belongs to this org BEFORE loading any context.
  // 404 (not 403) so we never leak whether the id exists in another org.
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, clientId),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { message, history } = parsed.data;

  // Build the full client context (every query strictly scoped to this
  // one client id).
  const { clientName, contextText, contextChars } = await loadClientAiContext(
    ctx.organization.id,
    clientId,
  );

  const systemPrompt = buildSystemPrompt(clientName, contextText);

  const anthropic = getAnthropic();
  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user" as const,
        content: wrapUserQuestion(clientName, message),
      },
    ],
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`\n\n[stream error: ${msg}]`));
        controller.close();
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });

  return new Response(responseStream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Client-Context-Chars": String(contextChars),
    },
  });
}

/* ============================================================================
 * Prompt construction
 * ========================================================================== */
function buildSystemPrompt(clientName: string, contextText: string): string {
  return `You are TechOS Client Assistant. You answer questions about ONE specific TechOS client only: **${clientName}**.

# Strict scope rules — read these every turn

1. You ONLY have data about **${clientName}**. You do not have access to data for any other USI client (AHP, Collision Leaders, Bestige Holdings, Industrial Injection, Medify, etc. unless THAT is the current client).
2. If the user asks about another client by name (any name other than "${clientName}"), refuse politely and remind them which client they are currently viewing. Suggest they navigate to that other client's page if they want answers about it.
3. Do not speculate beyond what the context contains. If the answer isn't in the context, say so plainly: "The TechOS record doesn't include that information."
4. Cite the section you used ("Hardware", "Locations", "Identity", "Runbook pages — <page title>", etc.) when giving substantive answers, so the user can verify.
5. For numeric / counting questions, show your count and list the items briefly. For superlatives ("oldest OS"), name the specific device(s) and the version.
6. Keep answers under ~250 words unless the question explicitly needs depth.
7. Format with bullet lists / short tables when the answer naturally is a list. Avoid wall-of-text.
8. Today's date is the most-recent date you can reasonably infer from the context (last events / heartbeats). Don't make up dates.

# Client context

Everything below this header is the COMPLETE TechOS record for **${clientName}**. There is no other source. If something is not in here, TechOS doesn't know it.

---

${contextText}`;
}

function wrapUserQuestion(clientName: string, question: string): string {
  return `[Question about **${clientName}** only — do not answer about any other client]

${question}`;
}
