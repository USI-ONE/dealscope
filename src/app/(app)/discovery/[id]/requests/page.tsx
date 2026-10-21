/**
 * Client requests — send the branch contact a no-login form with this
 * walk's open questions, then track who opened and answered it.
 */
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { discoveryInfoRequests } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { appBaseUrl } from "@/lib/email/account";
import { requestableQuestions } from "@/lib/discovery/info-request";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { RequestComposer, RequestList, type RequestRow } from "@/components/discovery/request-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client requests" };

export default async function RequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const [{ template, answers }, rows] = await Promise.all([
    loadProjectData(project),
    db
      .select()
      .from(discoveryInfoRequests)
      .where(eq(discoveryInfoRequests.projectId, project.id))
      .orderBy(desc(discoveryInfoRequests.createdAt)),
  ]);

  const questions = requestableQuestions(template, answers, project.naSections);
  // Pre-fill the recipient from the site contact on the walk.
  const poc = answers.get("cover.facility_poc")?.value?.v;
  const contact = poc && typeof poc === "object" && !Array.isArray(poc) ? (poc as Record<string, string>) : {};

  const list: RequestRow[] = rows.map((r) => {
    const resp = Object.values(r.responses ?? {});
    return {
      id: r.id,
      recipient: r.recipientName || r.recipientEmail || "Unnamed contact",
      email: r.recipientEmail,
      status: r.expiresAt < new Date() && r.status === "open" ? "expired" : r.status,
      questions: r.questionKeys.length,
      answered: resp.filter((x) => !x.unknown && x.v != null && (typeof x.v !== "string" || x.v.trim())).length,
      unknown: resp.filter((x) => x.unknown).length,
      sentAt: r.sentAt?.toISOString() ?? null,
      viewedAt: r.firstViewedAt?.toISOString() ?? null,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      link: `${appBaseUrl()}/request/${r.token}`,
    };
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Ask the client</h2>
        <p className="text-sm text-muted-foreground">
          Send the branch contact a simple form — no sign-in — with the questions only they can answer. Their answers land on this walk and
          clear the follow-ups automatically.
        </p>
      </div>

      {questions.length ? (
        <RequestComposer
          projectId={project.id}
          questions={questions}
          defaultName={contact.name ?? ""}
          defaultEmail={contact.email ?? ""}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No open questions to ask — every follow-up on this walk is answered.
        </p>
      )}

      {list.length > 0 && <RequestList projectId={project.id} requests={list} />}
    </div>
  );
}
