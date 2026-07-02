import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import {
  clientLocations,
  clients,
  diligenceEngagements,
} from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SurveyForm } from "@/components/site-surveys/survey-form";

export const metadata = { title: "DealScope · New site survey" };

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{
    clientId?: string;
    engagementId?: string;
    kind?: string;
  }>;
}) {
  const { clientId, engagementId, kind } = await searchParams;
  const ctx = await requireContext();
  if (!can("update", "client", { role: ctx.membership.role })) notFound();

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
          clientId: diligenceEngagements.clientId,
        })
        .from(diligenceEngagements)
        .where(
          eq(diligenceEngagements.organizationId, ctx.organization.id),
        )
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

  const locationsByClient: Record<string, Array<{ id: string; label: string }>> = {};
  for (const l of locationRows) {
    if (!locationsByClient[l.clientId]) locationsByClient[l.clientId] = [];
    locationsByClient[l.clientId].push({ id: l.id, label: l.label });
  }

  // Prefill scope from URL params. When an engagement is supplied, also
  // prefill the engagement's buyer client (if it has one) — engagements
  // are commonly tied to a client and the survey should be discoverable
  // from either side.
  let prefilledClientId: string | null = clientId ?? null;
  if (engagementId && !prefilledClientId) {
    const eng = engagementRows.find((e) => e.id === engagementId);
    if (eng?.clientId) prefilledClientId = eng.clientId;
  }

  const initialKind = (kind === "loi_diligence" ||
    kind === "onboarding" ||
    kind === "hardware_audit" ||
    kind === "general_site"
    ? kind
    : undefined) as
    | "loi_diligence"
    | "onboarding"
    | "hardware_audit"
    | "general_site"
    | undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/surveys"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to surveys
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          New site survey
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Survey details</CardTitle>
        </CardHeader>
        <CardContent>
          <SurveyForm
            members={members}
            clients={clientRows}
            engagements={engagementRows.map((e) => ({
              id: e.id,
              targetCompanyName: e.targetCompanyName,
            }))}
            locationsByClient={locationsByClient}
            initial={{
              ...(initialKind ? { kind: initialKind } : {}),
              clientId: prefilledClientId,
              engagementId: engagementId ?? null,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
