import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronLeft, Download, Plus } from "lucide-react";
import { db } from "@/db";
import {
  clientControlAssessments,
  clients,
  standardControls,
  standards,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { loadApplicableStandards } from "@/lib/compliance/applicable-standards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicableStandardsManager } from "@/components/compliance/applicable-standards-manager";
import { AssessmentGrid } from "@/components/compliance/assessment-grid";
import { StandardSwitcher } from "@/components/compliance/standard-switcher";
import { SourceLabel } from "@/components/compliance/status-pill";

export const metadata = { title: "DealScope · Compliance" };

export default async function ClientCompliancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ standardId?: string }>;
}) {
  const { id } = await params;
  const { standardId: chosenId } = await searchParams;
  const ctx = await requireContext();

  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) notFound();

  const allStandards = await db
    .select()
    .from(standards)
    .where(eq(standards.organizationId, ctx.organization.id))
    .orderBy(asc(standards.name));

  const applicable = await loadApplicableStandards(client.id, ctx.organization.id);
  const canEdit = can("update", "client", { role: ctx.membership.role });

  if (allStandards.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href={`/clients/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to {client.name}
        </Link>
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <h2 className="text-lg font-semibold">No standards yet</h2>
            <p className="text-sm text-muted-foreground">
              Create or clone a standard first, then come back here to assess
              this client against it.
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

  // Switcher prefers applicable standards; fall back to all if none yet.
  const switcherStandards =
    applicable.length > 0
      ? applicable.map((a) => ({
          id: a.standard.id,
          name:
            a.source === "inherited"
              ? `${a.standard.name}  ·  inherited`
              : a.standard.name,
        }))
      : allStandards.map((s) => ({ id: s.id, name: s.name }));

  // Pick the chosen standard or default to the first applicable, else first overall.
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
      .from(clientControlAssessments)
      .where(
        and(
          eq(clientControlAssessments.clientId, client.id),
          eq(clientControlAssessments.organizationId, ctx.organization.id),
        ),
      ),
  ]);

  // Restrict to assessments that belong to the active standard's control set.
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
          href={`/clients/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to {client.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Compliance — {client.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Pick a standard from the dropdown to assess this client against
              it. Each control gets a status (compliant / partial /
              non-compliant / N/A / unknown), an optional 0-100 score, and
              free-form evidence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="default">
              <Link
                href={`/clients/${id}/compliance/gaps`}
                title="See consolidated open gaps across every applicable standard"
              >
                View consolidated gap report
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a
                href={`/clients/${id}/compliance/${active.id}/export.docx`}
                title="Download a DOCX gap report for the selected standard"
              >
                <Download className="mr-1 size-3.5" /> Per-standard DOCX
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Applicable standards</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick the compliance frameworks this client must (or wants to)
            attain. Required ones drive the AI brief&apos;s remediation
            recommendations. Inherited entries come from the client&apos;s
            ownership group and are managed there.
          </p>
        </CardHeader>
        <CardContent>
          <ApplicableStandardsManager
            scope={{ kind: "client", clientId: client.id }}
            applicable={applicable.map((a) => ({
              standardId: a.standard.id,
              standardName: a.standard.name,
              source: a.source,
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
                basePath={`/clients/${id}/compliance`}
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
              </Link>{" "}
              and come back to assess.
            </p>
          ) : (
            <AssessmentGrid
              scope={{ kind: "client", clientId: client.id }}
              controls={controls}
              initialAssessments={initialAssessments}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
