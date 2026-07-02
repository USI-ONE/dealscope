import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import {
  clientLocations,
  clients,
  diligenceEngagements,
  siteSurveys,
} from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SurveyForm } from "@/components/site-surveys/survey-form";

export const metadata = { title: "DealScope · Edit site survey" };

function isoLocal(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditSurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  if (!can("update", "client", { role: ctx.membership.role })) notFound();

  const survey = await db.query.siteSurveys.findFirst({
    where: and(
      eq(siteSurveys.id, id),
      eq(siteSurveys.organizationId, ctx.organization.id),
    ),
  });
  if (!survey) notFound();

  const [members, clientRows, engagementRows, locationRows] =
    await Promise.all([
      getOrgMembers(ctx.organization.id),
      db
        .select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, ctx.organization.id),
            isNull(clients.archivedAt),
          ),
        )
        .orderBy(asc(clients.name)),
      db
        .select({
          id: diligenceEngagements.id,
          targetCompanyName: diligenceEngagements.targetCompanyName,
        })
        .from(diligenceEngagements)
        .where(eq(diligenceEngagements.organizationId, ctx.organization.id))
        .orderBy(asc(diligenceEngagements.targetCompanyName)),
      db
        .select({
          id: clientLocations.id,
          label: clientLocations.label,
          clientId: clientLocations.clientId,
        })
        .from(clientLocations)
        .where(eq(clientLocations.organizationId, ctx.organization.id)),
    ]);

  const locationsByClient: Record<
    string,
    Array<{ id: string; label: string }>
  > = {};
  for (const l of locationRows) {
    if (!locationsByClient[l.clientId]) locationsByClient[l.clientId] = [];
    locationsByClient[l.clientId].push({ id: l.id, label: l.label });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/surveys/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to survey
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Edit {survey.name}
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Survey details</CardTitle>
        </CardHeader>
        <CardContent>
          <SurveyForm
            existingId={survey.id}
            members={members}
            clients={clientRows}
            engagements={engagementRows}
            locationsByClient={locationsByClient}
            initial={{
              name: survey.name,
              kind: survey.kind,
              engagementId: survey.engagementId,
              clientId: survey.clientId,
              clientLocationId: survey.clientLocationId,
              siteAddress: survey.siteAddress ?? "",
              leadTechnicianMembershipId: survey.leadTechnicianMembershipId,
              scheduledDate:
                typeof survey.scheduledDate === "string"
                  ? survey.scheduledDate
                  : "",
              performedAt: isoLocal(survey.performedAt),
              summary: survey.summary ?? "",
              notes: survey.notes ?? "",
              accompaniedBy: survey.accompaniedBy ?? [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
