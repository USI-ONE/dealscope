import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { clients, standardChangeCatalog } from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangeRequestForm } from "@/components/change-control/change-request-form";

export const metadata = { title: "DealScope · New change request" };

export default async function NewChangeRequestPage({
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
  if (!can("update", "client", { role: ctx.membership.role })) {
    notFound();
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
          href={`/clients/${id}/changes`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to change requests
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          New change request — {client.name}
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Request details</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeRequestForm
            clientId={id}
            cancelHref={`/clients/${id}/changes`}
            members={members}
            catalog={catalog}
          />
        </CardContent>
      </Card>
    </div>
  );
}
