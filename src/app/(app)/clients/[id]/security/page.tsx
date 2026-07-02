/**
 * /clients/[id]/security — Client Security Posture review page.
 *
 * Mirrors the USI PS Client Security Posture Checklist xlsx template:
 *
 *   • 14 questions across 4 sections (security awareness training,
 *     identity & device management, endpoint policy, licensing)
 *   • Win11 hardware readiness summary + per-device table
 *
 * Auto-populates as much as possible from live system data (Syncro
 * hardware sync for Intune/Entra/EDR/Win11; vendor_seat_snapshots for
 * TitanHQ mailbox count; licenses for M365 tier; etc.). Operator
 * confirms / overrides each row and "Save as new review" appends a
 * snapshot to client_security_reviews.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import {
  ChevronLeft,
  Cpu,
  HardDrive,
  Laptop,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/db";
import {
  clientLocations,
  clients,
  clientMailboxes,
  clientSecurityReviews,
  hardware,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { derivePostureForClient } from "@/lib/security-review/derive-posture";
import { SecurityReviewEditor } from "@/components/security/security-review-editor";
import { Win11ReadinessSection } from "@/components/security/win11-readiness-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "DealScope · Security Posture" };

export default async function ClientSecurityPage({
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

  // Derive live posture (no DB writes) and pull last saved review.
  const posture = await derivePostureForClient({
    organizationId: ctx.organization.id,
    clientId: client.id,
  });
  const lastReview = await db
    .select()
    .from(clientSecurityReviews)
    .where(eq(clientSecurityReviews.clientId, client.id))
    .orderBy(desc(clientSecurityReviews.reviewDate))
    .limit(1);

  // Headline counts: total mailbox/seat count and total active devices.
  const mailboxCount = await db
    .select({ id: clientMailboxes.id })
    .from(clientMailboxes)
    .where(eq(clientMailboxes.clientId, client.id));
  const allDevices = await db
    .select({
      id: hardware.id,
      kind: hardware.kind,
      status: hardware.status,
      label: hardware.label,
      manufacturer: hardware.manufacturer,
      model: hardware.model,
      cpuLabel: hardware.cpuLabel,
      ramGb: hardware.ramGb,
      diskGb: hardware.diskGb,
      win11: hardware.windows11Readiness,
      osName: hardware.osName,
      osVersion: hardware.osVersion,
      assignedTo: hardware.assignedToLabel,
      warrantyEndsAt: hardware.warrantyEndsAt,
      purchasedAt: hardware.purchasedAt,
      lastSeenAt: hardware.lastSeenAt,
    })
    .from(hardware)
    .where(
      and(
        eq(hardware.organizationId, ctx.organization.id),
        eq(hardware.clientId, client.id),
      ),
    );
  const activeDevices = allDevices.filter((h) => h.status === "active");
  const totalSeats = mailboxCount.length;
  const totalDevices = activeDevices.length;

  const canEdit = can("update", "client", { role: ctx.membership.role });

  return (
    <div className="space-y-6">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to {client.name}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-3">
            <Shield className="size-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Security Posture
            </h1>
            <p className="text-muted-foreground">{client.name}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <CoverageStat
          icon={Shield}
          label="Entra joined"
          num={posture.endpointsEntraJoined}
          den={posture.totalActiveEndpoints}
        />
        <CoverageStat
          icon={ShieldCheck}
          label="Intune enrolled"
          num={posture.endpointsIntuneEnrolled}
          den={posture.totalActiveEndpoints}
        />
        <CoverageStat
          icon={ShieldAlert}
          label="EDR deployed"
          num={posture.endpointsWithEdr}
          den={posture.totalActiveEndpoints}
        />
        <CoverageStat
          icon={Laptop}
          label="Win11 eligible"
          num={posture.endpointsWin11Eligible}
          den={posture.totalActiveEndpoints}
        />
        <CoverageStat
          icon={Cpu}
          label="Mailboxes"
          num={totalSeats}
          den={null}
        />
        <CoverageStat
          icon={HardDrive}
          label="Active devices"
          num={totalDevices}
          den={null}
        />
      </div>

      {posture.m365Tier && (
        <Card className="border-blue-300 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/10">
          <CardHeader>
            <CardTitle className="text-base">M365 license tier</CardTitle>
            <CardDescription>
              From the licenses table — used to seed the "License tier"
              question.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <span className="font-medium">{posture.m365Tier}</span> ×{" "}
            <span className="tabular-nums">{posture.m365LicenseCount}</span>{" "}
            seats
          </CardContent>
        </Card>
      )}

      {canEdit ? (
        <SecurityReviewEditor
          clientId={client.id}
          clientName={client.name}
          suggested={posture.suggested}
          lastSavedAnswers={
            (lastReview[0]?.answersJson as
              | typeof posture.suggested
              | undefined) ?? null
          }
          lastSavedNotes={lastReview[0]?.generalNotes ?? null}
          lastReviewDate={
            lastReview[0]?.reviewDate
              ? String(lastReview[0].reviewDate)
              : null
          }
          totalSeats={totalSeats}
          totalDevices={totalDevices}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Read-only</CardTitle>
            <CardDescription>
              You don&apos;t have permission to edit client records.
              Live posture metrics are above; ask a manager to perform
              the review.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Win11ReadinessSection
        clientName={client.name}
        devices={activeDevices.map((d) => ({
          id: d.id,
          label: d.label,
          assignedTo: d.assignedTo,
          manufacturer: d.manufacturer,
          model: d.model,
          cpuLabel: d.cpuLabel,
          ramGb: d.ramGb,
          diskGb: d.diskGb,
          win11: d.win11,
          osName: d.osName,
          osVersion: d.osVersion,
          warrantyEndsAt: d.warrantyEndsAt
            ? String(d.warrantyEndsAt)
            : null,
          purchasedAt: d.purchasedAt ? String(d.purchasedAt) : null,
        }))}
      />
    </div>
  );
}

function CoverageStat({
  icon: Icon,
  label,
  num,
  den,
}: {
  icon: typeof Shield;
  label: string;
  num: number;
  den: number | null;
}) {
  const pct = den && den > 0 ? Math.round((num / den) * 100) : null;
  const color =
    pct == null
      ? "text-foreground"
      : pct >= 100
        ? "text-emerald-600 dark:text-emerald-400"
        : pct >= 80
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
        {den != null ? `${num}/${den}` : num.toLocaleString()}
      </div>
      {pct != null && (
        <div className={`text-xs ${color}`}>{pct}% coverage</div>
      )}
    </div>
  );
}
