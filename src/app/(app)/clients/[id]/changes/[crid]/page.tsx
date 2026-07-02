import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ChevronLeft, Download } from "lucide-react";
import { db } from "@/db";
import {
  changeRequestEvidence,
  changeRequests,
  clients,
  memberships,
  standardChangeCatalog,
  users,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RiskBadge,
  StatusBadge,
  STATUS_LABEL,
} from "@/components/change-control/status-badge";
import { ApproverManager } from "@/components/change-control/approver-manager";
import { EvidenceManager } from "@/components/change-control/evidence-manager";
import { StatusActions } from "@/components/change-control/status-actions";

export const metadata = { title: "DealScope · Change request" };

const TYPE_LABEL: Record<string, string> = {
  standard: "Standard",
  normal: "Normal",
  emergency: "Emergency",
};

const ENV_LABEL: Record<string, string> = {
  internal: "Internal IT",
  client: "Client-managed",
};

const RATING_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const IMPACT_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const LIKELIHOOD_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const OUTCOME_LABEL: Record<string, string> = {
  successful: "Successful",
  successful_with_issues: "Successful with issues",
  rolled_back: "Rolled back",
  failed: "Failed",
};

export default async function ChangeRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string; crid: string }>;
}) {
  const { id, crid } = await params;
  const ctx = await requireContext();

  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) notFound();

  const cr = await db.query.changeRequests.findFirst({
    where: and(
      eq(changeRequests.id, crid),
      eq(changeRequests.organizationId, ctx.organization.id),
      eq(changeRequests.clientId, id),
    ),
  });
  if (!cr) notFound();

  const canEdit = can("update", "client", { role: ctx.membership.role });
  const canEditCr = canEdit && cr.status !== "reviewed" && cr.status !== "cancelled";

  // Resolve role membership names + catalog entry name + evidence list
  const [memberRows, catalogRow, evidenceRows] = await Promise.all([
    db
      .select({
        id: memberships.id,
        name: users.name,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, ctx.organization.id)),
    cr.standardChangeCatalogId
      ? db.query.standardChangeCatalog.findFirst({
          where: eq(standardChangeCatalog.id, cr.standardChangeCatalogId),
        })
      : Promise.resolve(null),
    db
      .select({
        evidence: changeRequestEvidence,
        capturedByName: users.name,
        capturedByEmail: users.email,
      })
      .from(changeRequestEvidence)
      .leftJoin(
        memberships,
        eq(changeRequestEvidence.capturedByMembershipId, memberships.id),
      )
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(eq(changeRequestEvidence.changeRequestId, cr.id))
      .orderBy(desc(changeRequestEvidence.capturedAt)),
  ]);
  const memberById = new Map(
    memberRows.map((m) => [m.id, m.name ?? m.email]),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/clients/${id}/changes`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> All change requests
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {cr.refCode} · {client.name}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{cr.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={cr.status} />
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {TYPE_LABEL[cr.changeType] ?? cr.changeType}
              </span>
              <RiskBadge risk={cr.riskRating} />
              <span className="text-xs text-muted-foreground">
                {ENV_LABEL[cr.environment] ?? cr.environment}
              </span>
              {cr.cabRequired && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  CAB required
                </span>
              )}
              {cr.pirRequired && (
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  PIR required
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <a
                href={`/clients/${id}/changes/${crid}/export.docx`}
                title="Download a CCB-ready DOCX"
              >
                <Download className="mr-1 size-3.5" /> Export DOCX
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Current status: <strong>{STATUS_LABEL[cr.status]}</strong>. Next
            allowed transitions appear below.
          </p>
          {canEdit ? (
            <StatusActions
              changeRequestId={cr.id}
              status={cr.status}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              You don&apos;t have permission to advance this request.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Approvers (CCB)</CardTitle>
            {canEditCr && (
              <Button asChild variant="ghost" size="sm">
                <a href={`/clients/${id}/changes/${crid}/export.docx`}>
                  <Download className="mr-1 size-3.5" /> Export for CCB
                </a>
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Approval can come in-app, by phone, Teams, or email. The decision
            capture form requires a method + evidence note for any
            out-of-band approval — that&apos;s the audit trail.
          </p>
        </CardHeader>
        <CardContent>
          <ApproverManager
            changeRequestId={cr.id}
            approvers={cr.approvers}
            canEdit={canEditCr}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Request details</CardTitle>
            {canEditCr && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/clients/${id}/changes/${crid}/edit`}>Edit</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DetailField label="Change type" value={TYPE_LABEL[cr.changeType] ?? cr.changeType} />
            <DetailField label="Environment" value={ENV_LABEL[cr.environment] ?? cr.environment} />
            <DetailField
              label="Standard catalog entry"
              value={
                catalogRow
                  ? `${catalogRow.code} — ${catalogRow.title}`
                  : null
              }
            />
            <DetailField
              label="Risk impact"
              value={IMPACT_LABEL[cr.riskImpact] ?? cr.riskImpact}
            />
            <DetailField
              label="Risk likelihood"
              value={LIKELIHOOD_LABEL[cr.riskLikelihood] ?? cr.riskLikelihood}
            />
            <DetailField
              label="Risk rating"
              value={RATING_LABEL[cr.riskRating] ?? cr.riskRating}
            />
            <DetailField label="CAB required" value={cr.cabRequired ? "Yes" : "No"} />
            <DetailField label="PIR required" value={cr.pirRequired ? "Yes" : "No"} />
          </div>

          <DetailField label="Summary" value={cr.summary} />
          <DetailField
            label="Business justification"
            value={cr.businessJustification}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField
              label="Implementer"
              value={
                cr.implementerMembershipId
                  ? memberById.get(cr.implementerMembershipId) ?? null
                  : null
              }
            />
            <DetailField
              label="Change manager"
              value={
                cr.changeManagerMembershipId
                  ? memberById.get(cr.changeManagerMembershipId) ?? null
                  : null
              }
            />
            <DetailField
              label="System owner"
              value={
                cr.systemOwnerName
                  ? `${cr.systemOwnerName}${cr.systemOwnerEmail ? ` <${cr.systemOwnerEmail}>` : ""}`
                  : null
              }
            />
            <DetailField
              label="Requested by"
              value={
                cr.requestedByMembershipId
                  ? memberById.get(cr.requestedByMembershipId) ?? null
                  : null
              }
            />
            <DetailField
              label="Scheduled start"
              value={
                cr.scheduledStart
                  ? new Date(cr.scheduledStart).toLocaleString()
                  : null
              }
            />
            <DetailField
              label="Scheduled end"
              value={
                cr.scheduledEnd
                  ? new Date(cr.scheduledEnd).toLocaleString()
                  : null
              }
            />
            <DetailField
              label="Actual start"
              value={
                cr.actualStart
                  ? new Date(cr.actualStart).toLocaleString()
                  : null
              }
            />
            <DetailField
              label="Actual end"
              value={
                cr.actualEnd ? new Date(cr.actualEnd).toLocaleString() : null
              }
            />
            <DetailField
              label="Expected downtime"
              value={
                cr.expectedDowntimeMinutes !== null
                  ? `${cr.expectedDowntimeMinutes} min`
                  : null
              }
            />
            <DetailField label="Affected systems" value={cr.affectedSystems.join(", ") || null} />
          </div>
          <DetailField label="Impact statement" value={cr.impactStatement} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <DetailField
            label="Implementation plan"
            value={cr.implementationPlan}
          />
          <DetailField label="Rollback plan" value={cr.rollbackPlan} />
          <DetailField label="Validation plan" value={cr.validationPlan} />
          <DetailField label="Test plan" value={cr.testPlan} />
          <DetailField
            label="Communication plan"
            value={cr.communicationPlan}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Per policy §1.8 each change must retain approval records, pre/post
            config snapshots, logs / screenshots / command outputs, validation
            results, and rollback evidence (when used).
          </p>
        </CardHeader>
        <CardContent>
          <EvidenceManager
            changeRequestId={cr.id}
            evidence={evidenceRows.map((r) => ({
              id: r.evidence.id,
              kind: r.evidence.kind,
              label: r.evidence.label,
              url: r.evidence.url,
              notes: r.evidence.notes,
              capturedAt: r.evidence.capturedAt,
              capturedByName: r.capturedByName ?? r.capturedByEmail ?? null,
            }))}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {(cr.postReviewOutcome ||
        cr.pirPlannedVsActual ||
        cr.pirRootCause ||
        cr.pirPreventiveActions ||
        cr.postReviewIssues ||
        cr.postReviewLessons) && (
        <Card>
          <CardHeader>
            <CardTitle>Post-implementation review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <DetailField
              label="Outcome"
              value={
                cr.postReviewOutcome
                  ? OUTCOME_LABEL[cr.postReviewOutcome] ?? cr.postReviewOutcome
                  : null
              }
            />
            <DetailField
              label="Planned vs actual"
              value={cr.pirPlannedVsActual}
            />
            <DetailField label="Root cause" value={cr.pirRootCause} />
            <DetailField
              label="Preventive actions / lessons learned"
              value={cr.pirPreventiveActions ?? cr.postReviewLessons}
            />
            {cr.postReviewIssues && (
              <DetailField label="Issues" value={cr.postReviewIssues} />
            )}
            <DetailField
              label="Documentation updated"
              value={cr.documentationUpdated ? "Yes" : "No"}
            />
            {cr.linkedEventId && (
              <div className="text-xs text-muted-foreground">
                Linked ledger event id: <code>{cr.linkedEventId}</code>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {value ? (
        <p className="mt-1 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="mt-1 italic text-muted-foreground">—</p>
      )}
    </div>
  );
}
