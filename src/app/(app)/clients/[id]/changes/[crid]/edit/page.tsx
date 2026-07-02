import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import {
  changeRequests,
  clients,
  standardChangeCatalog,
} from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangeRequestForm } from "@/components/change-control/change-request-form";

export const metadata = { title: "DealScope · Edit change request" };

function isoLocal(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditChangeRequestPage({
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

  if (!can("update", "client", { role: ctx.membership.role })) notFound();
  if (cr.status === "reviewed" || cr.status === "cancelled") {
    return (
      <div className="space-y-4">
        <Link
          href={`/clients/${id}/changes/${crid}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </Link>
        <p className="text-sm text-muted-foreground">
          This change request is closed and can&apos;t be edited.
        </p>
      </div>
    );
  }

  const [members, catalog] = await Promise.all([
    getOrgMembers(ctx.organization.id),
    db
      .select({
        id: standardChangeCatalog.id,
        code: standardChangeCatalog.code,
        title: standardChangeCatalog.title,
        defaultRiskRating: standardChangeCatalog.defaultRiskRating,
      })
      .from(standardChangeCatalog)
      .where(eq(standardChangeCatalog.organizationId, ctx.organization.id))
      .orderBy(asc(standardChangeCatalog.code)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/clients/${id}/changes/${crid}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to {cr.refCode}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Edit {cr.refCode}
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Edit request details</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeRequestForm
            clientId={id}
            existingId={cr.id}
            cancelHref={`/clients/${id}/changes/${crid}`}
            members={members}
            catalog={catalog}
            initialValues={{
              title: cr.title,
              summary: cr.summary ?? "",
              businessJustification: cr.businessJustification ?? "",
              changeType: cr.changeType,
              environment: cr.environment,
              riskImpact: cr.riskImpact,
              riskLikelihood: cr.riskLikelihood,
              cabRequired: cr.cabRequired,
              pirRequired: cr.pirRequired,
              standardChangeCatalogId: cr.standardChangeCatalogId,
              implementationPlan: cr.implementationPlan ?? "",
              rollbackPlan: cr.rollbackPlan ?? "",
              testPlan: cr.testPlan ?? "",
              validationPlan: cr.validationPlan ?? "",
              communicationPlan: cr.communicationPlan ?? "",
              affectedSystems: cr.affectedSystems,
              expectedDowntimeMinutes: cr.expectedDowntimeMinutes,
              impactStatement: cr.impactStatement ?? "",
              implementerMembershipId: cr.implementerMembershipId,
              changeManagerMembershipId: cr.changeManagerMembershipId,
              systemOwnerName: cr.systemOwnerName ?? "",
              systemOwnerEmail: cr.systemOwnerEmail ?? "",
              scheduledStart: isoLocal(cr.scheduledStart),
              scheduledEnd: isoLocal(cr.scheduledEnd),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
