/**
 * Compact "Site surveys" summary card for the client + engagement
 * detail pages. Lists the most recent surveys with status pills + a
 * "schedule new" button that prefills the scope.
 */
import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import {
  type siteSurveys,
  SITE_SURVEY_KIND_LABEL,
  SITE_SURVEY_STATUS_LABEL,
} from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SurveyKindPill,
  SurveyStatusPill,
} from "./status-pill";

type SurveyRow = typeof siteSurveys.$inferSelect;

export function SurveySummaryCard({
  scope,
  surveys,
  canEdit,
}: {
  scope: { kind: "client"; clientId: string } | { kind: "engagement"; engagementId: string };
  surveys: SurveyRow[];
  canEdit: boolean;
}) {
  const newHref =
    scope.kind === "client"
      ? `/surveys/new?clientId=${scope.clientId}`
      : `/surveys/new?engagementId=${scope.engagementId}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4" />
            Site surveys
          </CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link href={newHref}>
                <Plus className="mr-1 size-3.5" /> New
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {surveys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No site surveys yet.
            {scope.kind === "client"
              ? " Schedule a hardware audit, onboarding survey, or general site walk."
              : " Schedule an LOI-stage on-site discovery visit."}
          </p>
        ) : (
          <ul className="space-y-2">
            {surveys.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded border bg-card p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/surveys/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <SurveyKindPill
                      kind={s.kind}
                      label={SITE_SURVEY_KIND_LABEL[s.kind] ?? s.kind}
                    />
                    <SurveyStatusPill
                      status={s.status}
                      label={SITE_SURVEY_STATUS_LABEL[s.status] ?? s.status}
                    />
                    {s.scheduledDate && (
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(s.scheduledDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
