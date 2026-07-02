import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";

// The Generate-briefing server action invoked from this page can run for
// 60-90s when an engagement carries 40+ responses (Anthropic call with
// adaptive thinking + 32k max_tokens). Server actions inherit the
// maxDuration of the page they're called from — 300s matches what we
// already grant the file-extraction route.
export const maxDuration = 300;
import { AlertTriangle, ChevronLeft, Printer, Sparkles } from "lucide-react";
import { db } from "@/db";
import {
  diligenceArtifacts,
  diligenceBriefings,
  diligenceCostLines,
  diligenceEngagements,
  diligenceFindings,
  diligenceSessions,
  memberships,
  users,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BriefingNarrativeCard } from "@/components/diligence/briefing-narrative-card";

type AiBriefingDraft = {
  executiveSummary: string;
  sections: Array<{
    heading: string;
    body: string;
    riskRating: "info" | "low" | "medium" | "high" | "critical";
  }>;
  topRisks: Array<{
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    narrative: string;
  }>;
  topOpportunities: Array<{ title: string; narrative: string }>;
  hundredDayPlan: string[];
};

export const metadata = { title: "DealScope · Briefing" };

const PILL_GRADIENT = "linear-gradient(135deg, #458C5E 0%, #3B697A 100%)";

const ARTIFACT_KIND_LABEL: Record<string, string> = {
  application: "Applications",
  server: "Servers / Infrastructure",
  network_site: "Network Sites",
  identity: "Identities & Privileged Accounts",
  vendor: "Vendors",
  license: "Licenses",
  ai_tool: "AI Tools",
  intercompany_dependency: "Intercompany Dependencies",
  key_person: "Key Persons",
  contract: "Contracts",
  dataset: "Datasets / Models",
  integration: "Integrations",
  process_gap: "Process Gaps",
  other: "Other",
};

const TIMING_LABEL: Record<string, string> = {
  pre_close: "Pre-close",
  first_30: "0–30 days",
  thirty_to_90: "30–90 days",
  ninety_to_180: "90–180 days",
  ongoing: "Ongoing",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export default async function TechOsBriefingPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) notFound();

  const canEditDiligence = can("update", "diligence", {
    role: ctx.membership.role,
  });

  const [leadRows, artifacts, findings, costLines, sessions, latestBriefingRows] = await Promise.all([
    engagement.leadInterviewerMembershipId
      ? db
          .select({ name: users.name, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(memberships.userId, users.id))
          .where(eq(memberships.id, engagement.leadInterviewerMembershipId))
          .limit(1)
      : Promise.resolve([] as { name: string | null; email: string }[]),
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
    db
      .select()
      .from(diligenceSessions)
      .where(eq(diligenceSessions.engagementId, engagement.id))
      .orderBy(asc(diligenceSessions.scheduledAt)),
    // Latest AI-generated briefing narrative — drives the prose block
    // at the top of the page. Auto-renders the most recent version any
    // time the user revisits.
    db
      .select({
        version: diligenceBriefings.version,
        contentJson: diligenceBriefings.contentJson,
        createdAt: diligenceBriefings.createdAt,
        generatedByName: users.name,
        generatedByEmail: users.email,
      })
      .from(diligenceBriefings)
      .leftJoin(
        memberships,
        eq(memberships.id, diligenceBriefings.generatedByMembershipId),
      )
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(eq(diligenceBriefings.engagementId, engagement.id))
      .orderBy(desc(diligenceBriefings.version))
      .limit(1),
  ]);
  const latestBriefing = latestBriefingRows[0] ?? null;
  const briefingDraft = (latestBriefing?.contentJson ?? null) as
    | AiBriefingDraft
    | null;

  // Section-rendering still uses DB findings rows
  const criticals = findings.filter((f) => f.severity === "critical");

  // KPI pills prefer the AI briefing's topRisks when a draft exists;
  // fall back to explicit DB findings when no briefing has been generated yet.
  const topRisks = briefingDraft?.topRisks ?? [];
  const usingBriefing = topRisks.length > 0;
  const totalFindings = usingBriefing ? topRisks.length : findings.length;
  const criticalAndHigh = usingBriefing
    ? topRisks.filter((r) => r.severity === "critical" || r.severity === "high").length
    : findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const immediates = usingBriefing
    ? topRisks.filter((r) => r.severity === "critical").length
    : findings.filter((f) => f.immediate).length;
  const totalLow = costLines.reduce((s, c) => s + c.lowCents, 0);
  const totalHigh = costLines.reduce((s, c) => s + c.highCents, 0);

  const grouped = new Map<string, typeof artifacts>();
  for (const a of artifacts) {
    const arr = grouped.get(a.kind) ?? [];
    arr.push(a);
    grouped.set(a.kind, arr);
  }
  const attentionItems = artifacts.filter((a) => a.needsAttention);

  const lead = Array.isArray(leadRows) ? leadRows[0] : null;
  const leadName = lead?.name ?? lead?.email ?? null;
  const preparedBy = [
    leadName ? `${leadName} (USI)` : null,
    engagement.partners,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const dateLabel = engagement.deliveryDate
    ? new Date(engagement.deliveryDate).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : engagement.kickoffDate
      ? new Date(engagement.kickoffDate).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : "";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <Link
          href={`/diligence/${engagement.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to engagement
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`?print=1`} target="_blank" rel="noreferrer">
              <Printer className="mr-1 size-3.5" /> Print / Save PDF
            </a>
          </Button>
        </div>
      </div>

      <Card className="border-2 print:border-0 print:shadow-none">
        <CardContent className="space-y-8 p-8 md:p-12">
          {/* Cover */}
          <header className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              IT Diligence Briefing
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              {engagement.targetCompanyName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {[engagement.codename, dateLabel].filter(Boolean).join("  ·  ")}
            </p>
            {preparedBy && (
              <p className="text-sm text-muted-foreground">{preparedBy}</p>
            )}
          </header>

          {/* Headline KPIs */}
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label={usingBriefing ? "Top Risks Identified" : "Total Findings"} value={String(totalFindings)} />
            <Kpi label="Critical / High" value={String(criticalAndHigh)} />
            <Kpi
              label="Estimated Remediation"
              value={
                totalHigh === 0
                  ? "—"
                  : `$${(totalLow / 100).toLocaleString()}–$${(totalHigh / 100).toLocaleString()}`
              }
            />
            <Kpi label={usingBriefing ? "Critical Items" : "Immediate Items"} value={String(immediates)} />
          </div>

          {/* AI-generated briefing narrative — pulled from the most
              recent diligence_briefings row. Renders the executive
              summary, per-section narrative, top risks, top
              opportunities, and the 100-day runbook so the operator
              sees what AI has synthesized from the evidence on file. */}
          <BriefingNarrativeCard
            engagementId={engagement.id}
            draft={briefingDraft}
            version={latestBriefing?.version ?? null}
            generatedByName={
              latestBriefing?.generatedByName ??
              latestBriefing?.generatedByEmail ??
              null
            }
            generatedAt={
              latestBriefing?.createdAt
                ? latestBriefing.createdAt.toISOString()
                : null
            }
            canEdit={canEditDiligence}
          />

          {/* Section 1 — Company & IT Context */}
          {engagement.summary && (
            <Section number="1" title="Company and IT Context">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {engagement.summary}
              </p>
            </Section>
          )}

          {/* Section 2 — Application Landscape */}
          {grouped.has("application") && (
            <Section number="2" title="Application Landscape">
              <div className="space-y-4">
                {(grouped.get("application") ?? []).map((a) => (
                  <ArtifactBlock key={a.id} artifact={a} />
                ))}
              </div>
            </Section>
          )}

          {/* Section 3 — Critical Findings */}
          {criticals.length > 0 && (
            <Section number="3" title="Critical Findings">
              <Note>
                All critical findings require action regardless of transaction timing.
                Items marked Immediate represent active, uncontrolled risk in the live
                production environment today.
              </Note>
              <div className="mt-4 space-y-4">
                {criticals.map((f) => (
                  <FindingBlock key={f.id} finding={f} />
                ))}
              </div>
            </Section>
          )}

          {/* Section 4 — High Findings Summary */}
          {findings.some((f) => f.severity === "high") && (
            <Section number="4" title="High Findings Summary">
              <FindingsTable
                findings={findings.filter((f) => f.severity === "high")}
              />
            </Section>
          )}

          {/* Section 5 — Platform Architecture Summary */}
          {(grouped.has("application") || grouped.has("server")) && (
            <Section number="5" title="Platform Architecture Summary">
              <ArchitectureTable
                rows={[
                  ...(grouped.get("application") ?? []).map((a) => ({
                    id: a.id,
                    name: a.title,
                    stack: a.data?.Stack ?? a.summary ?? "—",
                    function: a.data?.Function ?? "—",
                    data: a.data?.["Data Source"] ?? a.data?.["Data source"] ?? "—",
                    risk: a.riskLevel,
                  })),
                  ...(grouped.get("server") ?? []).map((s) => ({
                    id: s.id,
                    name: s.title,
                    stack: s.data?.OS ?? s.summary ?? "—",
                    function: s.data?.Role ?? "—",
                    data: s.data?.Location ?? "—",
                    risk: s.riskLevel,
                  })),
                ]}
              />
            </Section>
          )}

          {/* Section 6 — IT Organization */}
          {(grouped.has("key_person") || grouped.has("intercompany_dependency")) && (
            <Section number="6" title="IT Organization">
              {grouped.has("key_person") && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Staffing & Key Persons</h3>
                  <ul className="space-y-2">
                    {(grouped.get("key_person") ?? []).map((p) => (
                      <ArtifactListItem key={p.id} artifact={p} />
                    ))}
                  </ul>
                </div>
              )}
              {grouped.has("process_gap") && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold">Process & Governance Gaps</h3>
                  <ul className="space-y-2">
                    {(grouped.get("process_gap") ?? []).map((g) => (
                      <ArtifactListItem key={g.id} artifact={g} />
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Section 7 — Items Flagged for Attention */}
          {attentionItems.length > 0 && (
            <Section number="7" title="Items Flagged for Attention">
              <div className="space-y-3">
                {attentionItems.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 rounded-md border bg-amber-50/50 p-3 dark:bg-amber-950/20"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.title}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {ARTIFACT_KIND_LABEL[a.kind] ?? a.kind}
                        </Badge>
                      </div>
                      {a.summary && (
                        <p className="mt-1 text-xs text-muted-foreground">{a.summary}</p>
                      )}
                      {a.notes && (
                        <p className="mt-1 whitespace-pre-wrap text-xs">{a.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Section 8 — Affiliated Entity / Intercompany */}
          {grouped.has("intercompany_dependency") && (
            <Section number="8" title="Affiliated Entity & Intercompany Dependencies">
              <ul className="space-y-2">
                {(grouped.get("intercompany_dependency") ?? []).map((d) => (
                  <ArtifactListItem key={d.id} artifact={d} />
                ))}
              </ul>
            </Section>
          )}

          {/* Section 9 — Remediation Investment Summary */}
          {costLines.length > 0 && (
            <Section number="9" title="Remediation Investment Summary">
              <p className="mb-3 text-sm text-muted-foreground">
                The following estimate covers remediation required to bring the IT
                environment to a responsible operational baseline. It does not include new
                feature development, application modernization, or growth investment.
              </p>
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Work Item</th>
                    <th className="px-3 py-2 text-right font-medium">Low</th>
                    <th className="px-3 py-2 text-right font-medium">High</th>
                    <th className="px-3 py-2 font-medium">Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {costLines.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        {c.workItem}
                        {c.recurring && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (recurring)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ${(c.lowCents / 100).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ${(c.highCents / 100).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                        {TIMING_LABEL[c.timing] ?? c.timing}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-3 py-2 uppercase tracking-wider">Total estimated</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ${(totalLow / 100).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ${(totalHigh / 100).toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </Section>
          )}

          {/* Sessions log */}
          {sessions.length > 0 && (
            <Section number="10" title="Interview Sessions">
              <ul className="space-y-2 text-sm">
                {sessions.map((s) => (
                  <li key={s.id} className="border-l-2 border-muted pl-3">
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.scheduledAt
                        ? new Date(s.scheduledAt).toLocaleString()
                        : "Unscheduled"}{" "}
                      · {s.mode}
                      {s.location ? ` · ${s.location}` : ""}
                    </div>
                    {s.summary && (
                      <p className="mt-1 whitespace-pre-wrap text-xs">{s.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <footer className="border-t pt-4 text-center text-xs text-muted-foreground">
            {[
              preparedBy,
              engagement.codename,
              dateLabel,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </footer>

          {findings.length === 0 &&
            artifacts.length === 0 &&
            costLines.length === 0 &&
            !engagement.summary && (
              <p className="text-center text-sm text-muted-foreground">
                The briefing will populate as you capture sessions, artifacts, findings,
                and cost lines on the engagement page.
              </p>
            )}
        </CardContent>
      </Card>

    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight">
        <span className="text-muted-foreground">{number}.</span> {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: PILL_GRADIENT }}
    >
      <div className="text-2xl font-bold tabular-nums" style={{ color: "#ffffff" }}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.8)" }}>
        {label}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border-l-4 border-primary bg-muted/30 px-4 py-3 text-sm">
      <span className="mr-2 text-xs font-bold uppercase tracking-wider text-primary">
        Note
      </span>
      {children}
    </div>
  );
}

type ArtifactLite = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  data: Record<string, string> | null;
  riskLevel: string;
  notes: string | null;
};

function ArtifactBlock({ artifact }: { artifact: ArtifactLite }) {
  const dataEntries = Object.entries(artifact.data ?? {}).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">{artifact.title}</h3>
      {artifact.summary && <p className="text-sm">{artifact.summary}</p>}
      {dataEntries.length > 0 && (
        <ul className="ml-4 list-disc space-y-0.5 text-sm">
          {dataEntries.map(([k, v]) => (
            <li key={k}>
              <span className="text-muted-foreground">{k}:</span> {v}
            </li>
          ))}
        </ul>
      )}
      {artifact.notes && (
        <div className="rounded-md border-l-4 border-muted bg-muted/30 px-4 py-2 text-sm">
          <span className="mr-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Assessment
          </span>
          <span className="whitespace-pre-wrap">{artifact.notes}</span>
        </div>
      )}
    </div>
  );
}

function ArtifactListItem({ artifact }: { artifact: ArtifactLite }) {
  return (
    <li className="border-l-2 border-muted pl-3">
      <div className="font-medium">{artifact.title}</div>
      {artifact.summary && (
        <div className="text-sm text-muted-foreground">{artifact.summary}</div>
      )}
      {artifact.notes && (
        <p className="mt-1 whitespace-pre-wrap text-xs">{artifact.notes}</p>
      )}
    </li>
  );
}

function FindingBlock({
  finding,
}: {
  finding: {
    refCode: string;
    title: string;
    narrative: string | null;
    immediate: boolean;
  };
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold">
        <span className="font-mono text-sm">{finding.refCode}</span> — {finding.title}
        {finding.immediate && (
          <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
            Immediate
          </span>
        )}
      </h3>
      {finding.narrative && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{finding.narrative}</p>
      )}
    </div>
  );
}

function FindingsTable({
  findings,
}: {
  findings: { id: string; refCode: string; title: string; narrative: string | null; status: string }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-medium">Ref</th>
          <th className="px-3 py-2 font-medium">Finding</th>
          <th className="px-3 py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id} className="border-b last:border-0 align-top">
            <td className="px-3 py-2 font-mono text-xs">{f.refCode}</td>
            <td className="px-3 py-2">
              <div className="font-medium">{f.title}</div>
              {f.narrative && (
                <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {f.narrative}
                </div>
              )}
            </td>
            <td className="px-3 py-2 text-xs uppercase tracking-wider">{f.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ArchitectureTable({
  rows,
}: {
  rows: {
    id: string;
    name: string;
    stack: string;
    function: string;
    data: string;
    risk: string;
  }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Stack / OS</th>
          <th className="px-3 py-2 font-medium">Function / Role</th>
          <th className="px-3 py-2 font-medium">Data / Location</th>
          <th className="px-3 py-2 font-medium">Risk</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b last:border-0">
            <td className="px-3 py-2 font-medium">{r.name}</td>
            <td className="px-3 py-2">{r.stack}</td>
            <td className="px-3 py-2">{r.function}</td>
            <td className="px-3 py-2">{r.data}</td>
            <td className="px-3 py-2 text-xs uppercase tracking-wider">
              {SEVERITY_LABEL[r.risk] ?? r.risk}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
