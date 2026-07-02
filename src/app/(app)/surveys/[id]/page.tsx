import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import {
  clients,
  diligenceEngagements,
  memberships,
  siteSurveyItems,
  siteSurveyPhotos,
  siteSurveys,
  users,
  SITE_SURVEY_KIND_LABEL,
  SITE_SURVEY_KIND_DESCRIPTION,
  SITE_SURVEY_STATUS_LABEL,
  SITE_SURVEY_ITEM_GROUPS,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SurveyKindPill,
  SurveyStatusPill,
} from "@/components/site-surveys/status-pill";
import { InventoryGrid } from "@/components/site-surveys/inventory-grid";
import { PhotoGallery } from "@/components/site-surveys/photo-gallery";
import { SurveyStatusActions } from "@/components/site-surveys/survey-status-actions";

export const metadata = { title: "DealScope · Site survey" };

export default async function SurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const survey = await db.query.siteSurveys.findFirst({
    where: and(
      eq(siteSurveys.id, id),
      eq(siteSurveys.organizationId, ctx.organization.id),
    ),
  });
  if (!survey) notFound();

  const canEdit = can("update", "client", { role: ctx.membership.role });

  const [
    client,
    engagement,
    leadTechnician,
    items,
    photoRows,
  ] = await Promise.all([
    survey.clientId
      ? db.query.clients.findFirst({
          where: eq(clients.id, survey.clientId),
        })
      : Promise.resolve(null),
    survey.engagementId
      ? db.query.diligenceEngagements.findFirst({
          where: eq(diligenceEngagements.id, survey.engagementId),
        })
      : Promise.resolve(null),
    survey.leadTechnicianMembershipId
      ? db
          .select({ name: users.name, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(memberships.userId, users.id))
          .where(eq(memberships.id, survey.leadTechnicianMembershipId))
          .limit(1)
      : Promise.resolve([] as { name: string | null; email: string }[]),
    db
      .select()
      .from(siteSurveyItems)
      .where(eq(siteSurveyItems.surveyId, survey.id))
      .orderBy(asc(siteSurveyItems.kind), asc(siteSurveyItems.label)),
    db
      .select({
        photo: siteSurveyPhotos,
        itemLabel: siteSurveyItems.label,
        uploaderName: users.name,
        uploaderEmail: users.email,
      })
      .from(siteSurveyPhotos)
      .leftJoin(
        siteSurveyItems,
        eq(siteSurveyPhotos.itemId, siteSurveyItems.id),
      )
      .leftJoin(
        memberships,
        eq(siteSurveyPhotos.uploadedByMembershipId, memberships.id),
      )
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(eq(siteSurveyPhotos.surveyId, survey.id))
      .orderBy(desc(siteSurveyPhotos.uploadedAt)),
  ]);

  const leadName = Array.isArray(leadTechnician) && leadTechnician[0]
    ? leadTechnician[0].name ?? leadTechnician[0].email
    : null;

  // Rollups for the KPI panel.
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const itemsNeedingAction = items.filter(
    (i) =>
      i.recommendedAction === "refresh_now" ||
      i.recommendedAction === "replace" ||
      i.recommendedAction === "decommission",
  ).length;
  const remediationLow = items.reduce(
    (s, i) => s + (i.remediationCostLowCents ?? 0) * i.quantity,
    0,
  );
  const remediationHigh = items.reduce(
    (s, i) => s + (i.remediationCostHighCents ?? 0) * i.quantity,
    0,
  );

  const itemOptions = items.map((i) => ({ id: i.id, label: i.label }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/surveys"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> All surveys
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{survey.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SurveyKindPill
                kind={survey.kind}
                label={SITE_SURVEY_KIND_LABEL[survey.kind] ?? survey.kind}
              />
              <SurveyStatusPill
                status={survey.status}
                label={
                  SITE_SURVEY_STATUS_LABEL[survey.status] ?? survey.status
                }
              />
              {client && (
                <Link
                  href={`/clients/${client.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  → {client.name}
                </Link>
              )}
              {engagement && (
                <Link
                  href={`/diligence/${engagement.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  → {engagement.targetCompanyName}
                </Link>
              )}
              {leadName && (
                <span className="text-xs text-muted-foreground">
                  Lead: {leadName}
                </span>
              )}
              {survey.scheduledDate && (
                <span className="text-xs text-muted-foreground">
                  Scheduled {new Date(survey.scheduledDate).toLocaleDateString()}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
              {SITE_SURVEY_KIND_DESCRIPTION[survey.kind] ?? ""}
            </p>
          </div>
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/surveys/${survey.id}/edit`}>Edit details</Link>
            </Button>
          )}
        </div>
      </div>

      {/* KPI panel */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Stat label="Item rows" value={items.length} />
          <Stat label="Total units" value={totalItems} />
          <Stat
            label="Need action"
            value={itemsNeedingAction}
            tone={itemsNeedingAction > 0 ? "amber" : undefined}
          />
          <Stat
            label="Remediation est."
            value={
              remediationHigh === 0
                ? "—"
                : `$${Math.round(remediationLow / 100).toLocaleString()}–$${Math.round(remediationHigh / 100).toLocaleString()}`
            }
          />
        </CardContent>
      </Card>

      {survey.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{survey.summary}</p>
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <SurveyStatusActions surveyId={survey.id} status={survey.status} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Add every endpoint, monitor, peripheral, and infrastructure item
            you find. Use quantity {">"}1 for bulk-identical things (10
            wireless mice, 3 identical-spec workstations). Recommended
            action drives the remediation rollup at the top.
          </p>
        </CardHeader>
        <CardContent>
          <InventoryGrid
            surveyId={survey.id}
            groups={SITE_SURVEY_ITEM_GROUPS}
            items={items.map((i) => ({
              id: i.id,
              kind: i.kind,
              label: i.label,
              assetTag: i.assetTag,
              hostname: i.hostname,
              serialNumber: i.serialNumber,
              make: i.make,
              model: i.model,
              room: i.room,
              userAssigned: i.userAssigned,
              details: (i.details ?? {}) as Record<string, unknown>,
              installDate: i.installDate,
              warrantyEnd: i.warrantyEnd,
              condition: i.condition,
              recommendedAction: i.recommendedAction,
              remediationCostLowCents: i.remediationCostLowCents,
              remediationCostHighCents: i.remediationCostHighCents,
              notes: i.notes,
              quantity: i.quantity,
            }))}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Direct upload from a phone (camera tag preferred), or paste in
            URLs from SharePoint / OneDrive / cloud storage. Tag a photo to
            an item to link them; otherwise it&apos;s a general site shot.
          </p>
        </CardHeader>
        <CardContent>
          <PhotoGallery
            surveyId={survey.id}
            photos={photoRows.map((r) => ({
              id: r.photo.id,
              url: r.photo.url,
              filename: r.photo.filename,
              caption: r.photo.caption,
              itemId: r.photo.itemId,
              itemLabel: r.itemLabel,
              takenAt: r.photo.takenAt,
              uploadedAt: r.photo.uploadedAt,
              uploadedByName: r.uploaderName ?? r.uploaderEmail ?? null,
            }))}
            itemOptions={itemOptions}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {survey.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{survey.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "amber" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "emerald"
        ? "text-emerald-600 dark:text-emerald-400"
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

