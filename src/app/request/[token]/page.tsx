/**
 * Public info-request page — what the branch manager opens from the email.
 * No sign-in: the token is the credential (see ./actions.ts).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { discoveryAnswers, discoveryInfoRequests, discoveryProjects, organizations } from "@/db/schema";
import { CLIENT_QUESTIONS } from "@/lib/discovery/info-request";
import { getTemplate, templateIndex } from "@/lib/discovery/templates";
import { RequestForm, type FormQuestion } from "./request-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "A few quick questions", robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f4f1ea] px-4 py-8 text-[#1a1a1a] sm:py-14">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#458C5E]">USI Computer</p>
        <h1 className="mt-2 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-[15px] text-[#555]">{body}</p>
      </div>
    </Shell>
  );
}

export default async function InfoRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return <Message title="Link not found" body="Check the link in your email." />;
  const r = await db.query.discoveryInfoRequests.findFirst({ where: eq(discoveryInfoRequests.token, token) });
  if (!r) return <Message title="Link not found" body="Check the link in your email." />;
  if (r.status === "closed" || r.expiresAt < new Date())
    return <Message title="This link has closed" body="Thanks — we no longer need these answers. Reply to the email if anything has changed." />;

  const project = await db.query.discoveryProjects.findFirst({
    where: and(eq(discoveryProjects.id, r.projectId), isNull(discoveryProjects.archivedAt)),
  });
  if (!project) return <Message title="This link has closed" body="This request is no longer active." />;

  if (!r.firstViewedAt)
    await db.update(discoveryInfoRequests).set({ firstViewedAt: new Date() }).where(eq(discoveryInfoRequests.id, r.id));

  const [org, names] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(organizations.id, r.organizationId), columns: { name: true } }),
    db
      .select({ key: discoveryAnswers.questionKey, value: discoveryAnswers.value })
      .from(discoveryAnswers)
      .where(and(eq(discoveryAnswers.projectId, project.id), inArray(discoveryAnswers.questionKey, ["cover.client_name", "cover.site_name"]))),
  ]);
  const text = (k: string) => {
    const v = names.find((n) => n.key === k)?.value?.v;
    return typeof v === "string" ? v : "";
  };
  const company = text("cover.client_name");
  const site = text("cover.site_name") || project.name;

  const idx = templateIndex(getTemplate(project.templateKey));
  const questions: FormQuestion[] = r.questionKeys.flatMap((key) => {
    const f = idx.fields.get(key);
    if (!f) return [];
    const known = CLIENT_QUESTIONS[key];
    return [
      {
        key,
        prompt: known?.prompt ?? f.label,
        hint: known?.hint ?? f.hint ?? null,
        type: f.type,
        options: f.type === "yn" ? ["Yes", "No"] : (f.options ?? []),
        unit: f.unit ?? null,
        section: idx.sections.get(f.sectionKey)?.title ?? "",
      },
    ];
  });

  return (
    <Shell>
      <header className="mb-6 space-y-3 px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#458C5E]">{org?.name ?? "USI Computer"}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">A few quick questions</h1>
        <p className="text-lg">
          {company ? (
            <>
              <span className="font-semibold">{company}</span> · {site}
            </>
          ) : (
            <span className="font-semibold">{site}</span>
          )}
        </p>
        <p className="text-[15px] leading-relaxed text-[#444]">
          {r.recipientName ? `Hi ${r.recipientName.split(" ")[0]} — w` : "W"}e’re planning IT improvements for your office and need a few details only
          you’d know. Answer what you can and tick <em>“I don’t know”</em> for the rest. Your answers save as you go.
        </p>
        {r.message && <p className="rounded-xl bg-white/70 p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{r.message}</p>}
      </header>
      <RequestForm token={token} questions={questions} initial={r.responses} submitted={r.status === "submitted"} />
      <p className="mt-8 text-center text-xs text-[#777]">
        Sent securely by {org?.name ?? "USI Computer"} · This link is just for you and works until{" "}
        {r.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Denver" })}.
      </p>
    </Shell>
  );
}
