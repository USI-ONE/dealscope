import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import {
  clients,
  diligenceEngagements,
  siteSurveyItems,
  siteSurveys,
  SITE_SURVEY_KIND_LABEL,
  SITE_SURVEY_STATUS_LABEL,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SurveyKindPill,
  SurveyStatusPill,
} from "@/components/site-surveys/status-pill";

export const metadata = { title: "DealScope · Site surveys" };

export default async function SurveysPage() {
  const ctx = await requireContext();
  const canEdit = can("update", "client", { role: ctx.membership.role });

  const rows = await db
    .select({
      survey: siteSurveys,
      clientName: clients.name,
      engagementName: diligenceEngagements.targetCompanyName,
      itemCount: sql<number>`(
        SELECT count(*)::int FROM ${siteSurveyItems}
        WHERE ${siteSurveyItems.surveyId} = ${siteSurveys.id}
      )`.as("itemCount"),
    })
    .from(siteSurveys)
    .leftJoin(clients, eq(siteSurveys.clientId, clients.id))
    .leftJoin(
      diligenceEngagements,
      eq(siteSurveys.engagementId, diligenceEngagements.id),
    )
    .where(eq(siteSurveys.organizationId, ctx.organization.id))
    .orderBy(
      desc(siteSurveys.scheduledDate),
      asc(siteSurveys.name),
    );

  // Group by status bucket: open vs closed
  const open = rows.filter(
    (r) =>
      r.survey.status === "planning" || r.survey.status === "in_progress",
  );
  const closed = rows.filter(
    (r) => r.survey.status === "complete" || r.survey.status === "cancelled",
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Site surveys</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              On-site discovery work. Categorized by purpose: M&amp;A LOI
              diligence, client onboarding, hardware audits, or general
              site walks. Each survey carries an itemized inventory + a
              photo gallery + recommended actions for compliance gap
              analysis.
            </p>
          </div>
          {canEdit && (
            <Button asChild>
              <Link href="/surveys/new">
                <Plus className="mr-1 size-3.5" /> New survey
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open ({open.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <SurveyTable rows={open} emptyText="No open surveys." />
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Complete / cancelled ({closed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <SurveyTable rows={closed} emptyText="" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SurveyTable({
  rows,
  emptyText,
}: {
  rows: Array<{
    survey: typeof siteSurveys.$inferSelect;
    clientName: string | null;
    engagementName: string | null;
    itemCount: number;
  }>;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Kind</th>
          <th className="px-3 py-2 font-medium">Status</th>
          <th className="px-3 py-2 font-medium">Scope</th>
          <th className="px-3 py-2 font-medium">Items</th>
          <th className="px-3 py-2 font-medium">Scheduled</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.survey.id}
            className="border-b last:border-0 hover:bg-muted/30"
          >
            <td className="px-3 py-2">
              <Link
                href={`/surveys/${r.survey.id}`}
                className="font-medium hover:underline"
              >
                {r.survey.name}
              </Link>
              {r.survey.summary && (
                <p className="text-xs text-muted-foreground">
                  {r.survey.summary.slice(0, 100)}
                  {r.survey.summary.length > 100 ? "…" : ""}
                </p>
              )}
            </td>
            <td className="px-3 py-2">
              <SurveyKindPill
                kind={r.survey.kind}
                label={SITE_SURVEY_KIND_LABEL[r.survey.kind] ?? r.survey.kind}
              />
            </td>
            <td className="px-3 py-2">
              <SurveyStatusPill
                status={r.survey.status}
                label={
                  SITE_SURVEY_STATUS_LABEL[r.survey.status] ?? r.survey.status
                }
              />
            </td>
            <td className="px-3 py-2 text-xs">
              {r.clientName ? (
                <Link
                  href={`/clients/${r.survey.clientId}`}
                  className="hover:underline"
                >
                  {r.clientName}
                </Link>
              ) : r.engagementName ? (
                <Link
                  href={`/diligence/${r.survey.engagementId}`}
                  className="hover:underline"
                >
                  {r.engagementName}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td className="px-3 py-2 text-xs tabular-nums">{r.itemCount}</td>
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {r.survey.scheduledDate
                ? new Date(r.survey.scheduledDate).toLocaleDateString()
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
