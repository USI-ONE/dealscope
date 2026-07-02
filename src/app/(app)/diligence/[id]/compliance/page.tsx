import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronLeft, Download, Plus } from "lucide-react";
import { db } from "@/db";
import {
  diligenceEngagementControlAssessments,
  diligenceEngagements,
  standardControls,
  standards,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import {
  loadEngagementApplicableStandards,
} from "@/server/actions/compliance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicableStandardsManager } from "@/components/compliance/applicable-standards-manager";
import { AssessmentGrid } from "@/components/compliance/assessment-grid";
import { StandardSwitcher } from "@/components/compliance/standard-switcher";
import { SourceLabel } from "@/components/compliance/status-pill";

export const metadata = { title: "DealScope · Engagement compliance" };

export default async function EngagementCompliancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ standardId?: string }>;
}) {
  const { id } = await params;
  const { standardId: chosenId } = await searchParams;
  const ctx = await requireContext();

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) notFound();

  const allStandards = await db
    .select()
    .from(standards)
    .where(eq(standards.organizationId, ctx.organization.id))
    .orderBy(asc(standards.name));

  const applicable = await loadEngagementApplicableStandards(
    engagement.id,
    ctx.organization.id,
  );
  const canEdit = can("update", "diligence", { role: ctx.membership.role });

  if (allStandards.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href={`/diligence/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to engagement
        </Link>
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <h2 className="text-lg font-semibold">No standards yet</h2>
            <p className="text-sm text-muted-foreground">
              Create or clone a standard, then come back to measure this
              engagement&apos;s discovery against it.
            </p>
            <Button asChild>
              <Link href="/standards">
                <Plus className="mr-1 size-3.5" /> Go to Standards
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Switcher prefers applicable standards; falls back to all.
  const switcherStandards =
    applicable.length > 0
      ? applicable.map((a) => ({ id: a.standard.id, name: a.standard.name }))
      : allStandards.map((s) => ({ id: s.id, name: s.name }));

  const activeId =
    chosenId ?? (applicable[0]?.standard.id ?? allStandards[0].id);
  const active = allStandards.find((s) => s.id === activeId);
  if (!active) notFound();

  const [controls, assessmentRows] = await Promise.all([
    db
      .select()
      .from(standardControls)
      .where(eq(standardControls.standardId, active.id))
      .orderBy(asc(standardControls.position)),
    db
      .select()
      .from(diligenceEngagementControlAssessments)
      .where(
        and(
          eq(diligenceEngagementControlAssessments.engagementId, engagement.id),
          eq(
            diligenceEngagementControlAssessments.organizationId,
            ctx.organization.id,
          ),
        ),
      ),
  ]);

  const controlIds = new Set(controls.map((c) => c.id));
  const initialAssessments = assessmentRows
    .filter((a) => controlIds.has(a.controlId))
    .map((a) => ({
      controlId: a.controlId,
      status: a.status,
      score: a.score,
      evidence: a.evidence,
      assessedAt: a.assessedAt,
    }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/diligence/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to engagement
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Compliance — {engagement.targetCompanyName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Measure discovery findings against the standards this target
              should meet. Each control gets a status (compliant / partial /
              non-compliant / N/A / unknown), an optional score, and
              free-form evidence (cite the inventory file, the question
              response, the artifact).
            </p>
          </div>
          <Button asChild variant="outline">
            <a
              href={`/diligence/${id}/compliance/${active.id}/export.docx`}
              title="Download a DOCX gap report for this engagement"
            >
              <Download className="mr-1 size-3.5" /> Export gap report
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Applicable standards</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            The frameworks the target should meet. Required ones drive the
            briefing AI&apos;s recommendations and the gap report.
          </p>
        </CardHeader>
        <CardContent>
          <ApplicableStandardsManager
            scope={{ kind: "engagement", engagementId: engagement.id }}
            applicable={applicable.map((a) => ({
              standardId: a.standard.id,
              standardName: a.standard.name,
              source: "explicit" as const,
              isRequired: a.isRequired,
              rationale: a.rationale,
            }))}
            allStandards={allStandards.map((s) => ({ id: s.id, name: s.name }))}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Standard</CardTitle>
            <div className="flex items-center gap-2">
              <StandardSwitcher
                basePath={`/diligence/${id}/compliance`}
                standards={switcherStandards}
                activeId={active.id}
              />
              <Link
                href={`/standards/${active.id}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Edit standard →
              </Link>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <SourceLabel source={active.source} />
            {active.version ? ` · ${active.version}` : ""}
          </p>
          {active.description && (
            <p className="mt-2 max-w-3xl text-sm">{active.description}</p>
          )}
        </CardHeader>
        <CardContent>
          {controls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This standard has no controls yet.{" "}
              <Link href={`/standards/${active.id}`} className="underline">
                Add some
              </Link>
              .
            </p>
          ) : (
            <AssessmentGrid
              scope={{ kind: "engagement", engagementId: engagement.id }}
              controls={controls}
              initialAssessments={initialAssessments}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
