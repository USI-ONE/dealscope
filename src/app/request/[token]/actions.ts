"use server";

/**
 * Public (no sign-in) actions behind a client info-request link. The token
 * is the only credential, so every call re-checks it is open and unexpired,
 * and only the questions on that request can be written.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { discoveryAnswers, discoveryInfoRequests, discoveryProjects, memberships, users } from "@/db/schema";
import type { DiscoveryAnswerValue } from "@/db/schema/discovery";
import { appBaseUrl } from "@/lib/email/account";
import { sendInfoRequestAnsweredEmail } from "@/lib/email/discovery";
import { getTemplate, templateIndex } from "@/lib/discovery/templates";

const responseSchema = z.object({
  v: z.union([z.string().max(4000), z.array(z.string().max(300)).max(40), z.record(z.string().max(300)), z.null()]),
  unknown: z.boolean().optional(),
  note: z.string().max(2000).optional(),
});
type Response = z.infer<typeof responseSchema>;

async function openRequest(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = await db.query.discoveryInfoRequests.findFirst({ where: eq(discoveryInfoRequests.token, token) });
  if (!r || r.status === "closed" || r.expiresAt < new Date()) return null;
  return r;
}

/** Autosave one answer as a draft (nothing touches the walk until submit). */
export async function saveDraft(token: string, key: string, response: Response) {
  const r = await openRequest(token);
  if (!r || !r.questionKeys.includes(key)) return { ok: false };
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) return { ok: false };
  await db
    .update(discoveryInfoRequests)
    .set({ responses: { ...r.responses, [key]: parsed.data }, updatedAt: new Date() })
    .where(eq(discoveryInfoRequests.id, r.id));
  return { ok: true };
}

function hasAnswer(v: Response["v"]) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Object.values(v).some((s) => s.trim());
}

/** Apply every answer to the site walk and notify whoever sent the request. */
export async function submitAnswers(token: string, responses: Record<string, Response>) {
  const r = await openRequest(token);
  if (!r) return { ok: false, error: "This link has expired or been closed." };
  const project = await db.query.discoveryProjects.findFirst({ where: eq(discoveryProjects.id, r.projectId) });
  if (!project) return { ok: false, error: "This request is no longer available." };

  const idx = templateIndex(getTemplate(project.templateKey));
  const keys = r.questionKeys.filter((k) => k in responses);
  const existing = keys.length
    ? await db
        .select()
        .from(discoveryAnswers)
        .where(and(eq(discoveryAnswers.projectId, project.id), inArray(discoveryAnswers.questionKey, keys)))
    : [];
  const byKey = new Map(existing.map((a) => [a.questionKey, a]));
  const who = r.recipientName || "the client";
  const when = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });
  const clean: Record<string, Response> = {};
  let answered = 0;
  let unknown = 0;

  for (const key of keys) {
    const parsed = responseSchema.safeParse(responses[key]);
    const field = idx.fields.get(key);
    if (!parsed.success || !field) continue;
    const resp = parsed.data;
    clean[key] = resp;
    const prev = byKey.get(key);
    // Keep the walker's context, drop the generic "Unknown — follow up" placeholder.
    const prevNote = prev?.notes && !/^unknown\b[\s—-]*(follow up)?$/i.test(prev.notes.trim()) ? prev.notes : "";
    const clientNote = resp.note?.trim() ? `${who}: “${resp.note.trim()}”` : "";

    let value: DiscoveryAnswerValue;
    let note: string;
    if (hasAnswer(resp.v) && !resp.unknown) {
      value = { v: resp.v as DiscoveryAnswerValue["v"], extras: prev?.value?.extras };
      note = [prevNote, `Answered by ${who} on ${when}.`, clientNote].filter(Boolean).join(" ");
      answered++;
    } else if (resp.unknown) {
      value = { ...(prev?.value ?? {}), followUp: true };
      note = [prevNote || "Unknown — follow up", `${who} didn’t know (${when}).`, clientNote].filter(Boolean).join(" ");
      unknown++;
    } else continue;

    await db
      .insert(discoveryAnswers)
      .values({ organizationId: project.organizationId, projectId: project.id, questionKey: key, value, notApplicable: false, notes: note })
      .onConflictDoUpdate({
        target: [discoveryAnswers.projectId, discoveryAnswers.questionKey],
        set: { value, notApplicable: false, notes: note, updatedAt: new Date() },
      });
  }

  await db
    .update(discoveryInfoRequests)
    .set({ responses: { ...r.responses, ...clean }, status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(discoveryInfoRequests.id, r.id));
  await db.update(discoveryProjects).set({ updatedAt: new Date() }).where(eq(discoveryProjects.id, project.id));

  // Let the sender know.
  if (r.createdByMembershipId && (answered || unknown)) {
    const [sender] = await db
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.id, r.createdByMembershipId));
    if (sender?.email) {
      const site = await db.query.discoveryAnswers.findFirst({
        where: and(eq(discoveryAnswers.projectId, project.id), eq(discoveryAnswers.questionKey, "cover.site_name")),
      });
      await sendInfoRequestAnsweredEmail({
        to: sender.email,
        recipient: r.recipientName || "Your contact",
        site: (typeof site?.value?.v === "string" && site.value.v) || project.name,
        answered,
        unknown,
        link: `${appBaseUrl()}/discovery/${project.id}/requests`,
      }).catch((err) => console.error("[info-request] notify failed", err));
    }
  }

  revalidatePath(`/discovery/${project.id}`, "layout");
  return { ok: true, answered, unknown };
}
