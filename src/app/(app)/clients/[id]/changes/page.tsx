import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ChevronLeft, Plus } from "lucide-react";
import { db } from "@/db";
import { changeRequests, clients } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RiskBadge,
  StatusBadge,
} from "@/components/change-control/status-badge";

export const metadata = { title: "DealScope · Change requests" };

export default async function ClientChangeRequestsPage({
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

  const rows = await db
    .select()
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.clientId, id),
        eq(changeRequests.organizationId, ctx.organization.id),
      ),
    )
    .orderBy(desc(changeRequests.createdAt));

  const canEdit = can("update", "client", { role: ctx.membership.role });

  // Group by status bucket: open vs closed
  const openStatuses = new Set([
    "draft",
    "submitted",
    "in_review",
    "approved",
    "scheduled",
    "in_progress",
    "implemented",
  ]);
  const open = rows.filter((r) => openStatuses.has(r.status));
  const closed = rows.filter((r) => !openStatuses.has(r.status));

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
              Change requests
            </h1>
            <p className="text-sm text-muted-foreground">
              Formal RFC workflow: draft → review → approve → schedule →
              implement → close. Each closed CR also writes a row to the
              client&apos;s change ledger.
            </p>
          </div>
          {canEdit && (
            <Button asChild>
              <Link href={`/clients/${id}/changes/new`}>
                <Plus className="mr-1 size-3.5" /> New change request
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Open ({open.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CrTable rows={open} clientId={id} emptyText="No open change requests." />
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed / archived ({closed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <CrTable rows={closed} clientId={id} emptyText="" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CrTable({
  rows,
  clientId,
  emptyText,
}: {
  rows: Array<{
    id: string;
    refCode: string;
    title: string;
    status: string;
    riskClass: string;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    createdAt: Date;
  }>;
  clientId: string;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyText}</p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-medium">Ref</th>
          <th className="px-3 py-2 font-medium">Title</th>
          <th className="px-3 py-2 font-medium">Risk</th>
          <th className="px-3 py-2 font-medium">Status</th>
          <th className="px-3 py-2 font-medium">Window</th>
          <th className="px-3 py-2 font-medium">Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
            <td className="px-3 py-2 font-mono text-xs">
              <Link
                href={`/clients/${clientId}/changes/${r.id}`}
                className="hover:underline"
              >
                {r.refCode}
              </Link>
            </td>
            <td className="px-3 py-2">
              <Link
                href={`/clients/${clientId}/changes/${r.id}`}
                className="font-medium hover:underline"
              >
                {r.title}
              </Link>
            </td>
            <td className="px-3 py-2">
              <RiskBadge risk={r.riskClass} />
            </td>
            <td className="px-3 py-2">
              <StatusBadge status={r.status} />
            </td>
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {r.scheduledStart
                ? new Date(r.scheduledStart).toLocaleString()
                : "—"}
            </td>
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
