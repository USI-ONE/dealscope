import { ScrollActiveIntoView } from "@/components/ui/scroll-active-into-view";
import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  Activity,
  Building2,
  ChevronLeft,
  ClipboardList,
  Cpu,
  GitBranch,
  LayoutGrid,
  Lock,
  MessageSquare,
  Scale,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Generate-briefing server action can run 60-90s; 300s matches the briefing route.
export const maxDuration = 300;
import { db } from "@/db";
import {
  clients,
  diligenceArtifacts,
  diligenceAttendees,
  diligenceCostLines,
  diligenceDataRequests,
  diligenceDialogueMessages,
  diligenceDialogueThreads,
  diligenceEngagementLog,
  diligenceEngagementResponses,
  diligenceEngagements,
  diligenceFindings,
  diligenceMilestones,
  diligenceParties,
  diligencePartyInvitations,
  diligenceSessions,
  diligenceVaultFiles,
  diligenceWorkstreamTasks,
  memberships,
  siteSurveyItems,
  siteSurveys,
  users,
} from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { ArtifactsCard } from "@/components/diligence/artifacts-card";
import { TrackHealthCard } from "@/components/diligence/track-health-card";
import { BriefingDraftCard } from "@/components/diligence/briefing-draft-card";
import { DiligenceChatDrawer } from "@/components/diligence/chat-drawer";
import { ConvertToClientButton } from "@/components/diligence/convert-to-client-button";
import { CostLinesCard } from "@/components/diligence/cost-lines-card";
import { DataRequestsCard } from "@/components/diligence/data-requests-card";
import { DealRoomCard } from "@/components/diligence/deal-room-card";
import { EngagementLogCard } from "@/components/diligence/engagement-log-card";
import { EngagementOverviewCard } from "@/components/diligence/engagement-overview-card";
import { FindingsCard } from "@/components/diligence/findings-card";
import { NotesExtractionCard } from "@/components/diligence/notes-extraction-card";
import { QuestionnaireCard } from "@/components/diligence/questionnaire-card";
import { MaQuestionnaireCard } from "@/components/diligence/ma-questionnaire-card";
import { MaTrackSummaryCard } from "@/components/diligence/ma-track-summary-card";
import { SessionsCard } from "@/components/diligence/sessions-card";
import { EnvironmentSummaryCard } from "@/components/diligence/environment-summary-card";
import { SurveySummaryCard } from "@/components/site-surveys/survey-summary-card";
import { VaultCard } from "@/components/diligence/vault-card";
import { WorkstreamsCard } from "@/components/diligence/workstreams-card";
import { buildEnvironmentTotals } from "@/lib/diligence/environment-totals";
import { getQuestionsForIndustry } from "@/lib/diligence/question-library";
import {
  ALL_MA_QUESTIONS,
  getMaQuestionsForTrack,
  type MaTrack,
} from "@/lib/diligence/ma-question-library";

export const metadata = { title: "DealScope · Engagement" };

const TABS = [
  { id: "it",          label: "IT",           icon: Cpu,           group: "tracks" },
  { id: "legal",       label: "Legal",         icon: Scale,         group: "tracks" },
  { id: "finance",     label: "Finance",       icon: TrendingUp,    group: "tracks" },
  { id: "facilities",  label: "Facilities",    icon: Building2,     group: "tracks" },
  { id: "hr",          label: "HR",            icon: Users,         group: "tracks" },
  { id: "vault",       label: "Vault",         icon: Lock,          group: "ops" },
  { id: "requests",    label: "Requests",      icon: ClipboardList, group: "ops" },
  { id: "workstreams", label: "Workstreams",   icon: GitBranch,     group: "ops" },
  { id: "deal-room",   label: "Deal Room",     icon: MessageSquare, group: "collab" },
  { id: "log",         label: "Log",           icon: Activity,      group: "collab" },
  { id: "summary",     label: "Summary",       icon: LayoutGrid,    group: "summary" },
] as const;

type TabId = (typeof TABS)[number]["id"];
const MA_TABS: MaTrack[] = ["legal", "finance", "facilities", "hr"];

export default async function DiligenceEngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab = ((sp as Record<string, string>).tab ?? "it") as TabId;

  const ctx = await requireContext();

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) notFound();

  const sessionAttendeeCounts = db.$with("sac").as(
    db
      .select({
        sessionId: diligenceAttendees.sessionId,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(diligenceAttendees)
      .groupBy(diligenceAttendees.sessionId),
  );

  const [sessions, artifacts, findings, costLines, members, clientOpts, responseRows] =
    await Promise.all([
      db
        .with(sessionAttendeeCounts)
        .select({
          session: diligenceSessions,
          attendeeCount: sessionAttendeeCounts.count,
        })
        .from(diligenceSessions)
        .leftJoin(
          sessionAttendeeCounts,
          eq(sessionAttendeeCounts.sessionId, diligenceSessions.id),
        )
        .where(eq(diligenceSessions.engagementId, engagement.id))
        .orderBy(desc(diligenceSessions.scheduledAt)),
      db
        .select()
        .from(diligenceArtifacts)
        .where(eq(diligenceArtifacts.engagementId, engagement.id))
        .orderBy(asc(diligenceArtifacts.title)),
      db
        .select()
        .from(diligenceFindings)
        .where(eq(diligenceFindings.engagementId, engagement.id))
        .orderBy(asc(diligenceFindings.refCode)),
      db
        .select()
        .from(diligenceCostLines)
        .where(eq(diligenceCostLines.engagementId, engagement.id))
        .orderBy(asc(diligenceCostLines.position)),
      getOrgMembers(ctx.organization.id),
      db.query.clients.findMany({
        where: eq(clients.organizationId, ctx.organization.id),
        columns: { id: true, name: true, slug: true },
        orderBy: (c, { asc }) => [asc(c.name)],
      }),
      db
        .select({
          questionKey: diligenceEngagementResponses.questionKey,
          value: diligenceEngagementResponses.value,
          satisfactory: diligenceEngagementResponses.satisfactory,
          notes: diligenceEngagementResponses.notes,
        })
        .from(diligenceEngagementResponses)
        .where(eq(diligenceEngagementResponses.engagementId, engagement.id)),
    ]);

  const itQuestions = getQuestionsForIndustry(engagement.industry ?? null);
  const itResponses = responseRows.map((r) => ({
    questionKey: r.questionKey,
    value: r.value,
    satisfactory: r.satisfactory,
    notes: r.notes,
  }));
  const satisfactoryCount = responseRows.filter((r) => r.satisfactory).length;
  const aiAvailable = !!process.env.ANTHROPIC_API_KEY;

  const engagementSurveys = await db
    .select()
    .from(siteSurveys)
    .where(
      and(
        eq(siteSurveys.engagementId, engagement.id),
        eq(siteSurveys.organizationId, ctx.organization.id),
      ),
    )
    .orderBy(desc(siteSurveys.scheduledDate))
    .limit(5);

  const inventoryRows = await db
    .select({
      kind: siteSurveyItems.kind,
      total: sql<number>`coalesce(sum(${siteSurveyItems.quantity}), 0)::int`.as("total"),
    })
    .from(siteSurveyItems)
    .innerJoin(siteSurveys, eq(siteSurveyItems.surveyId, siteSurveys.id))
    .where(
      and(
        eq(siteSurveys.engagementId, engagement.id),
        eq(siteSurveys.organizationId, ctx.organization.id),
      ),
    )
    .groupBy(siteSurveyItems.kind);

  const surveyKindTotals: Record<string, number> = {};
  for (const r of inventoryRows) surveyKindTotals[r.kind] = r.total;

  const environmentTotals = buildEnvironmentTotals({
    surveyKindTotals,
    responses: responseRows.map((r) => ({
      questionKey: r.questionKey,
      value: r.value,
    })),
  });

  // ── New deal-room features: fetch only on the relevant tab ──────────────
  const memberMap = new Map(members.map((m) => [m.id, m.fullName ?? m.email]));

  const vaultFiles =
    tab === "vault"
      ? await db
          .select({
            id: diligenceVaultFiles.id,
            name: diligenceVaultFiles.name,
            description: diligenceVaultFiles.description,
            track: diligenceVaultFiles.track,
            blobUrl: diligenceVaultFiles.blobUrl,
            sizeBytes: diligenceVaultFiles.sizeBytes,
            mimeType: diligenceVaultFiles.mimeType,
            accessTier: diligenceVaultFiles.accessTier,
            uploadedByMembershipId: diligenceVaultFiles.uploadedByMembershipId,
            createdAt: diligenceVaultFiles.createdAt,
          })
          .from(diligenceVaultFiles)
          .where(eq(diligenceVaultFiles.engagementId, engagement.id))
          .orderBy(desc(diligenceVaultFiles.createdAt))
      : [];

  const dataRequests =
    tab === "requests"
      ? await db
          .select()
          .from(diligenceDataRequests)
          .where(eq(diligenceDataRequests.engagementId, engagement.id))
          .orderBy(asc(diligenceDataRequests.position), asc(diligenceDataRequests.createdAt))
      : [];

  const [workstreamTasks, milestones] =
    tab === "workstreams"
      ? await Promise.all([
          db
            .select()
            .from(diligenceWorkstreamTasks)
            .where(eq(diligenceWorkstreamTasks.engagementId, engagement.id))
            .orderBy(asc(diligenceWorkstreamTasks.position), asc(diligenceWorkstreamTasks.createdAt)),
          db
            .select()
            .from(diligenceMilestones)
            .where(eq(diligenceMilestones.engagementId, engagement.id))
            .orderBy(asc(diligenceMilestones.position), asc(diligenceMilestones.createdAt)),
        ])
      : [[], []];

  const [partiesWithInvitations, dialogueThreads] =
    tab === "deal-room"
      ? await Promise.all([
          db.query.diligenceParties.findMany({
            where: eq(diligenceParties.engagementId, engagement.id),
            with: { invitations: true },
            orderBy: (t, { asc }) => [asc(t.createdAt)],
          }),
          db.query.diligenceDialogueThreads.findMany({
            where: eq(diligenceDialogueThreads.engagementId, engagement.id),
            with: { messages: { orderBy: (m, { asc }) => [asc(m.createdAt)] } },
            orderBy: (t, { desc }) => [desc(t.createdAt)],
          }),
        ])
      : [[], []];

  const logEntries =
    tab === "log"
      ? await db
          .select()
          .from(diligenceEngagementLog)
          .where(eq(diligenceEngagementLog.engagementId, engagement.id))
          .orderBy(desc(diligenceEngagementLog.createdAt))
          .limit(200)
      : [];

  const canEdit = can("update", "diligence", { role: ctx.membership.role });
  const canDelete = can("delete", "diligence", { role: ctx.membership.role });
  const canConvertToClient =
    can("create", "client", { role: ctx.membership.role }) && canEdit;
  const linkedClient = engagement.clientId
    ? clientOpts.find((c) => c.id === engagement.clientId) ?? null
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/diligence"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-3.5" /> Engagements
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-primary">
              M&amp;A Diligence Engagement
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">
                {engagement.targetCompanyName}
              </h1>
              {linkedClient && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <svg viewBox="0 0 8 8" fill="currentColor" className="size-1.5">
                    <circle cx="4" cy="4" r="4" />
                  </svg>
                  Converted to client ·{" "}
                  <Link
                    href={`/clients/${linkedClient.slug}`}
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    {linkedClient.name}
                  </Link>
                </span>
              )}
            </div>
            {engagement.codename && (
              <p className="mt-1 text-[16px] text-muted-foreground">{engagement.codename}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConvertToClientButton
              engagementId={engagement.id}
              linkedClientSlug={linkedClient?.slug ?? null}
              linkedClientName={linkedClient?.name ?? null}
              canEdit={canConvertToClient}
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/diligence/${engagement.id}/compliance`}>
                <Shield className="mr-1 size-3.5" /> Compliance
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Engagement overview always visible */}
      <EngagementOverviewCard
        engagement={{
          id: engagement.id,
          targetCompanyName: engagement.targetCompanyName,
          codename: engagement.codename,
          status: engagement.status,
          industry: engagement.industry ?? null,
          clientId: engagement.clientId,
          leadInterviewerMembershipId: engagement.leadInterviewerMembershipId,
          partners: engagement.partners,
          summary: engagement.summary,
          kickoffDate: engagement.kickoffDate,
          deliveryDate: engagement.deliveryDate,
          archivedAt: engagement.archivedAt,
        }}
        members={members}
        clients={clientOpts}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {/* Track navigation — Apple segmented-control style */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {/* Phones: full-bleed, swipeable strip with the active tab scrolled into view. */}
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-1 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <ScrollActiveIntoView />
            <nav
              aria-label="Diligence tracks"
              className="inline-flex min-w-full items-center gap-0.5 rounded-2xl bg-muted/60 p-1"
            >
              {TABS.map((t, i) => {
                const prev = TABS[i - 1] as typeof TABS[number] | undefined;
                const isActive = tab === t.id;
                return (
                  <Fragment key={t.id}>
                    {prev && prev.group !== t.group && (
                      <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />
                    )}
                    <Link
                      href={`/diligence/${engagement.id}?tab=${t.id}`}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150 sm:py-1.5",
                        isActive
                          ? "bg-card text-foreground shadow-card"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                      )}
                    >
                      <t.icon className="size-3.5 shrink-0" />
                      {t.label}
                    </Link>
                  </Fragment>
                );
              })}
            </nav>
          </div>
          {/* Infographic quick link — only for the 5 diligence tracks */}
          {(["it", "legal", "finance", "facilities", "hr"] as string[]).includes(tab) && (
            <Link
              href={`/diligence/${engagement.id}/report/${tab}`}
              className="shrink-0 text-[12px] font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <span>Infographic</span>
              <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* IT tab */}
      {tab === "it" && (
        <div className="space-y-6">
          <EnvironmentSummaryCard
            engagementId={engagement.id}
            totals={environmentTotals}
            surveyCount={engagementSurveys.length}
            responseCount={responseRows.length}
          />

          <SurveySummaryCard
            scope={{ kind: "engagement", engagementId: engagement.id }}
            surveys={engagementSurveys}
            canEdit={canEdit}
          />

          {aiAvailable && (
            <NotesExtractionCard
              engagementId={engagement.id}
              questionMeta={itQuestions.map((q) => ({
                key: q.key,
                text: q.text,
                category: q.category,
                subcategory: q.subcategory,
              }))}
              canEdit={canEdit}
            />
          )}

          <QuestionnaireCard
            engagementId={engagement.id}
            industry={engagement.industry ?? null}
            questions={itQuestions}
            responses={itResponses}
            canEdit={canEdit}
            aiEnabled={aiAvailable}
          />

          <SessionsCard
            engagementId={engagement.id}
            sessions={sessions.map((s) => ({
              id: s.session.id,
              title: s.session.title,
              scheduledAt: s.session.scheduledAt,
              durationMinutes: s.session.durationMinutes,
              location: s.session.location,
              mode: s.session.mode,
              attendeeCount: s.attendeeCount ?? 0,
            }))}
            canEdit={canEdit}
          />

          <ArtifactsCard
            engagementId={engagement.id}
            artifacts={artifacts.map((a) => ({
              id: a.id,
              kind: a.kind,
              title: a.title,
              summary: a.summary,
              data: (a.data ?? {}) as Record<string, string>,
              riskLevel: a.riskLevel,
              needsAttention: a.needsAttention,
              notes: a.notes,
            }))}
            canEdit={canEdit}
          />
        </div>
      )}

      {/* Legal / Finance / Facilities / HR tabs */}
      {(MA_TABS as string[]).includes(tab) && (() => {
        const trackQuestions = getMaQuestionsForTrack(tab as MaTrack);
        const trackKeys = new Set(trackQuestions.map((q) => q.key));
        const trackResponses = responseRows.filter((r) => trackKeys.has(r.questionKey));
        const trackAnswered = trackResponses.filter((r) => r.value != null && String(r.value).trim() !== "").length;
        const trackSatisfactory = trackResponses.filter((r) => r.satisfactory).length;
        return (
        <div className="space-y-6">
          <MaTrackSummaryCard
            track={tab}
            totalQuestions={trackQuestions.length}
            answeredCount={trackAnswered}
            satisfactoryCount={trackSatisfactory}
          />

          {aiAvailable && (
            <NotesExtractionCard
              engagementId={engagement.id}
              questionMeta={getMaQuestionsForTrack(tab as MaTrack).map((q) => ({
                key: q.key,
                text: q.text,
                category: q.category,
                subcategory: q.subcategory,
              }))}
              canEdit={canEdit}
            />
          )}

          <MaQuestionnaireCard
            engagementId={engagement.id}
            track={tab as MaTrack}
            questions={getMaQuestionsForTrack(tab as MaTrack)}
            responses={itResponses}
            canEdit={canEdit}
          />

          <SessionsCard
            engagementId={engagement.id}
            sessions={sessions.map((s) => ({
              id: s.session.id,
              title: s.session.title,
              scheduledAt: s.session.scheduledAt,
              durationMinutes: s.session.durationMinutes,
              location: s.session.location,
              mode: s.session.mode,
              attendeeCount: s.attendeeCount ?? 0,
            }))}
            canEdit={canEdit}
          />

          <ArtifactsCard
            engagementId={engagement.id}
            artifacts={artifacts.map((a) => ({
              id: a.id,
              kind: a.kind,
              title: a.title,
              summary: a.summary,
              data: (a.data ?? {}) as Record<string, string>,
              riskLevel: a.riskLevel,
              needsAttention: a.needsAttention,
              notes: a.notes,
            }))}
            canEdit={canEdit}
          />
        </div>
        );
      })()}

      {/* Summary tab */}
      {tab === "summary" && (
        <div className="space-y-6">
          <TrackHealthCard
            engagementId={engagement.id}
            responses={itResponses}
            industry={engagement.industry ?? null}
          />

          <FindingsCard
            engagementId={engagement.id}
            findings={findings.map((f) => ({
              id: f.id,
              refCode: f.refCode,
              severity: f.severity,
              title: f.title,
              narrative: f.narrative,
              status: f.status,
              immediate: f.immediate,
              relatedArtifactIds: f.relatedArtifactIds,
            }))}
            canEdit={canEdit}
            costLines={costLines.map((c) => ({
              id: c.id,
              findingId: c.findingId ?? null,
              lowCents: c.lowCents,
              highCents: c.highCents,
              costType: c.costType ?? null,
              workItem: c.workItem,
            }))}
          />

          <CostLinesCard
            engagementId={engagement.id}
            costLines={costLines.map((c) => ({
              id: c.id,
              workItem: c.workItem,
              lowCents: c.lowCents,
              highCents: c.highCents,
              recurring: c.recurring,
              timing: c.timing,
              category: c.category,
              notes: c.notes,
              position: c.position,
              findingId: c.findingId ?? null,
              costType: c.costType ?? null,
            }))}
            canEdit={canEdit}
            findings={findings.map((f) => ({ id: f.id, refCode: f.refCode, title: f.title }))}
          />

          {aiAvailable && (
            <BriefingDraftCard
              engagementId={engagement.id}
              canEdit={canEdit}
              satisfactoryCount={satisfactoryCount}
              totalCount={itQuestions.length + ALL_MA_QUESTIONS.length}
            />
          )}
        </div>
      )}

      {/* Vault tab */}
      {tab === "vault" && (
        <VaultCard
          engagementId={engagement.id}
          files={vaultFiles.map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            track: f.track,
            blobUrl: f.blobUrl,
            sizeBytes: f.sizeBytes,
            mimeType: f.mimeType,
            accessTier: f.accessTier,
            uploadedByName: f.uploadedByMembershipId ? (memberMap.get(f.uploadedByMembershipId) ?? null) : null,
            createdAt: f.createdAt.toISOString(),
          }))}
          canEdit={canEdit}
        />
      )}

      {/* Requests tab */}
      {tab === "requests" && (
        <DataRequestsCard
          engagementId={engagement.id}
          requests={dataRequests.map((r) => ({
            id: r.id,
            track: r.track,
            title: r.title,
            description: r.description,
            status: r.status,
            dueDate: r.dueDate,
            assignedTo: r.assignedTo,
            notes: r.notes,
            position: r.position,
          }))}
          canEdit={canEdit}
        />
      )}

      {/* Workstreams tab */}
      {tab === "workstreams" && (
        <WorkstreamsCard
          engagementId={engagement.id}
          tasks={(workstreamTasks as typeof diligenceWorkstreamTasks.$inferSelect[]).map((t) => ({
            id: t.id,
            track: t.track,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            ownerName: t.ownerMembershipId ? (memberMap.get(t.ownerMembershipId) ?? null) : null,
            ownerMembershipId: t.ownerMembershipId,
            dueDate: t.dueDate,
            completedAt: t.completedAt?.toISOString() ?? null,
          }))}
          milestones={(milestones as typeof diligenceMilestones.$inferSelect[]).map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            targetDate: m.targetDate,
            completedAt: m.completedAt?.toISOString() ?? null,
            position: m.position,
          }))}
          members={members.map((m) => ({ id: m.id, name: m.fullName ?? m.email }))}
          canEdit={canEdit}
        />
      )}

      {/* Deal Room tab */}
      {tab === "deal-room" && (
        <DealRoomCard
          engagementId={engagement.id}
          targetCompanyName={engagement.targetCompanyName}
          parties={(partiesWithInvitations as (typeof diligenceParties.$inferSelect & { invitations: typeof diligencePartyInvitations.$inferSelect[] })[]).map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            emailDomain: p.emailDomain,
            invitations: p.invitations.map((inv) => ({
              id: inv.id,
              email: inv.email,
              name: inv.name,
              role: inv.role,
              acceptedAt: inv.acceptedAt?.toISOString() ?? null,
              lastAccessedAt: inv.lastAccessedAt?.toISOString() ?? null,
              expiresAt: inv.expiresAt.toISOString(),
            })),
          }))}
          threads={(dialogueThreads as (typeof diligenceDialogueThreads.$inferSelect & { messages: typeof diligenceDialogueMessages.$inferSelect[] })[]).map((t) => ({
            id: t.id,
            track: t.track,
            subject: t.subject,
            status: t.status,
            isInternal: t.isInternal,
            submittedByName: t.submittedByMembershipId ? (memberMap.get(t.submittedByMembershipId) ?? null) : null,
            assignedToName: t.assignedToMembershipId ? (memberMap.get(t.assignedToMembershipId) ?? null) : null,
            messageCount: t.messages.length,
            lastActivity: t.messages.length > 0
              ? t.messages[t.messages.length - 1]!.createdAt.toISOString()
              : t.createdAt.toISOString(),
            messages: t.messages.map((m) => ({
              id: m.id,
              content: m.content,
              fromName: m.fromMembershipId ? (memberMap.get(m.fromMembershipId) ?? null) : null,
              isInternal: m.isInternal,
              createdAt: m.createdAt.toISOString(),
            })),
          }))}
          members={members.map((m) => ({ id: m.id, name: m.fullName ?? m.email }))}
          canEdit={canEdit}
        />
      )}

      {/* Log tab */}
      {tab === "log" && (
        <EngagementLogCard
          entries={logEntries.map((e) => ({
            id: e.id,
            action: e.action,
            resourceType: e.resourceType,
            resourceId: e.resourceId,
            detail: e.detail,
            actorName: e.actorName,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
      )}

      {/* AI chat drawer — available on all tabs */}
      {aiAvailable && canEdit && (
        <DiligenceChatDrawer engagementId={engagement.id} />
      )}
    </div>
  );
}
