import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AI_MODEL,
  buildSystemPrompt,
  getAnthropic,
  loadEngagementContext,
} from "@/lib/ai/anthropic";
import { canCtx, requireContext } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  engagementId: z.string().uuid(),
  message: z.string().min(1).max(10_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(40)
    .default([]),
});

/**
 * Streams the assistant's reply as text/plain chunks. The client appends
 * each chunk to the message bubble as it arrives. We're deliberately NOT
 * using SSE — plain chunked text is simpler and adequate for a single-
 * stream chat. If we add multi-stream features (parallel typing, tool
 * use status), upgrade to SSE then.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireContext();
  if (!canCtx("update", "diligence", ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { engagementId, message, history } = parsed.data;

  const { context, questions } = await loadEngagementContext(
    engagementId,
    ctx.organization.id,
  );

  const client = getAnthropic();
  const stream = client.messages.stream({
    model: AI_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: buildSystemPrompt(questions, context),
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user" as const,
        content: `# Live coaching mode

You are now acting as a real-time coaching partner during a diligence interview. The interviewer just asked or said:

${message}

Respond directly and concretely. If the interviewer is asking what to ask next, name specific questions from the catalog (by their text, not the key) and how to phrase them. If they paste a snippet from the conversation, react to it: extract what's actionable, flag risks, suggest a follow-up. Keep replies under ~250 words unless they explicitly ask for depth.`,
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
      // Client aborted — abort the upstream stream too.
      stream.controller.abort();
    },
  });

  return new Response(responseStream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
