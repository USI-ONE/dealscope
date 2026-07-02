import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ChevronLeft, Download } from "lucide-react";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { loadConsolidatedGaps, tallyGapStats } from "@/lib/compliance/gaps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "DealScope · Compliance gaps" };

const STATUS_TONE: Record<string, { tone: string; label: string }> = {
  non_compliant: {
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    label: "Non-compliant",
  },
  partial: {
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    label: "Partial",
  },
  unknown: {
    tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    label: "Unknown",
  },
  not_assessed: {
    tone: "bg-muted text-muted-foreground",
    label: "Not assessed",
  },
};

export default async function ClientGapsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) notFound();

  const groups = await loadConsolidatedGaps(client.id, ctx.organization.id);
  const stats = tallyGapStats(groups);
  const requiredGroups = groups.filter((g) => g.isRequired);
  const aspirationalGroups = groups.filter((g) => !g.isRequired);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/clients/${id}/compliance`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to compliance
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Gap report — {client.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Every open control across every applicable standard, prioritized
              with required standards on top. This is the punch list of
              what {client.name} doesn&apos;t currently have.
            </p>
          </div>
          {groups.length > 0 && (
            <Button variant="outline" asChild>
              <a
                href={`/clients/${id}/compliance/gaps/export.docx`}
                title="Download a consolidated gap report DOCX"
              >
                <Download className="mr-1 size-3.5" /> Consolidated DOCX
              </a>
            </Button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No standards are applicable to this client yet. Go to{" "}
              <Link
                href={`/clients/${id}/compliance`}
                className="underline"
              >
                Compliance
              </Link>{" "}
              to add some.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI panel */}
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
              <Stat label="Controls in scope" value={stats.total} />
              <Stat label="Compliant" value={stats.compliant} tone="emerald" />
              <Stat
                label="Open gaps"
                value={stats.openGaps}
                tone={stats.openGaps > 0 ? "rose" : undefined}
              />
              <Stat
                label="Required open"
                value={stats.requiredOpenGaps}
                tone={stats.requiredOpenGaps > 0 ? "amber" : undefined}
              />
              <Stat
                label="Not assessed"
                value={stats.notAssessed}
                tone={stats.notAssessed > 0 ? "amber" : undefined}
              />
            </CardContent>
          </Card>

          {requiredGroups.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Required standards — these have regulatory / contractual /
                insurance weight
              </h2>
              {requiredGroups.map((g) => (
                <StandardGapCard
                  key={g.standard.id}
                  clientId={id}
                  group={g}
                />
              ))}
            </section>
          )}

          {aspirationalGroups.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aspirational standards
              </h2>
              {aspirationalGroups.map((g) => (
                <StandardGapCard
                  key={g.standard.id}
                  clientId={id}
                  group={g}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StandardGapCard({
  clientId,
  group,
}: {
  clientId: string;
  group: Awaited<ReturnType<typeof loadConsolidatedGaps>>[number];
}) {
  const openGaps = group.domains.reduce((s, d) => s + d.gaps.length, 0);
  const pct =
    group.rollup.total === 0
      ? 0
      : Math.round((group.rollup.compliant / group.rollup.total) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link
                href={`/clients/${clientId}/compliance?standardId=${group.standard.id}`}
                className="hover:underline"
              >
                {group.standard.name}
              </Link>
              {group.standard.version && (
                <span className="text-xs font-normal text-muted-foreground">
                  {group.standard.version}
                </span>
              )}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant="outline"
                className={
                  group.isRequired
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : ""
                }
              >
                {group.isRequired ? "Required" : "Aspirational"}
              </Badge>
              <Badge
                variant="outline"
                className={
                  group.source === "inherited" ? "bg-primary/10" : ""
                }
              >
                {group.source === "inherited" ? "Inherited" : "Explicit"}
              </Badge>
              <span>
                <strong>{group.rollup.compliant}</strong> /{" "}
                {group.rollup.total} compliant ({pct}%)
              </span>
              <span>·</span>
              <span>
                <strong>{openGaps}</strong> open gap
                {openGaps === 1 ? "" : "s"}
              </span>
            </div>
            {group.rationale && (
              <p className="mt-2 max-w-3xl rounded bg-muted/30 p-2 text-xs italic">
                Why it applies: {group.rationale}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/clients/${clientId}/compliance?standardId=${group.standard.id}`}
              >
                Open assessment
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/clients/${clientId}/compliance/${group.standard.id}/export.docx`}
              >
                <Download className="mr-1 size-3.5" /> Per-standard DOCX
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {openGaps === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            No open gaps on this standard.
          </p>
        ) : (
          <div className="space-y-3">
            {group.domains.map((d, i) => (
              <div key={d.domain?.id ?? `ungrouped-${i}`} className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {d.domain
                    ? `${d.domain.code ? `${d.domain.code}. ` : ""}${d.domain.title}`
                    : "Ungrouped"}
                </h3>
                <ul className="space-y-1">
                  {d.gaps.map((gap) => (
                    <GapRow key={gap.controlId} gap={gap} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GapRow({
  gap,
}: {
  gap: Awaited<ReturnType<typeof loadConsolidatedGaps>>[number]["domains"][number]["gaps"][number];
}) {
  const tone = STATUS_TONE[gap.status] ?? STATUS_TONE.not_assessed;
  return (
    <li className="rounded border bg-card p-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        {gap.controlCode && (
          <span className="font-mono text-xs text-muted-foreground">
            {gap.controlCode}
          </span>
        )}
        <span className="font-medium">{gap.controlTitle}</span>
        <Badge
          variant="outline"
          className={`text-[10px] uppercase tracking-wider ${tone.tone}`}
        >
          {tone.label}
        </Badge>
        {gap.assessedAt && (
          <span className="text-[10px] text-muted-foreground">
            Assessed {new Date(gap.assessedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {gap.controlDescription && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {gap.controlDescription}
        </p>
      )}
      {gap.controlGuidance && (
        <p className="mt-1 rounded bg-emerald-500/5 p-1.5 text-[11px]">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            What good looks like:
          </span>{" "}
          {gap.controlGuidance}
        </p>
      )}
      {gap.evidence && (
        <p className="mt-1 rounded bg-muted/30 p-1.5 text-[11px]">
          <span className="font-semibold">Current state:</span> {gap.evidence}
        </p>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "";
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
