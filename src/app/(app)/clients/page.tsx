import { eq } from "drizzle-orm";
import { Building2 } from "lucide-react";
import { db } from "@/db";
import { clients, memberships, users } from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientList, type ClientRow } from "@/components/clients/client-list";
import { CreateClientDialog } from "@/components/clients/create-client-dialog";

export const metadata = { title: "DealScope · Clients" };

export default async function TechOsClientsPage() {
  const ctx = await requireContext();

  // Both fetches are independent — run them in parallel so the page
  // renders as soon as the slower of the two completes, not the sum.
  const [rows, allMembers] = await Promise.all([
    db
      .select({
        client: clients,
        managerName: users.name,
        managerEmail: users.email,
      })
      .from(clients)
      .leftJoin(memberships, eq(clients.accountManagerMembershipId, memberships.id))
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(eq(clients.organizationId, ctx.organization.id))
      .orderBy(clients.name),
    getOrgMembers(ctx.organization.id),
  ]);

  const data: ClientRow[] = rows.map((r) => ({
    id: r.client.id,
    name: r.client.name,
    slug: r.client.slug,
    status: r.client.status,
    primaryDomain: r.client.primaryDomain,
    industry: r.client.industry,
    accountManagerName: r.managerName ?? r.managerEmail ?? null,
    monthlyRecurringCents: r.client.monthlyRecurringCents,
    archivedAt: r.client.archivedAt,
  }));

  const canCreate = can("create", "client", { role: ctx.membership.role });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-lg bg-primary/10 p-3 sm:block">
            <Building2 className="size-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
            <p className="text-muted-foreground">
              MSP clients managed by TechOS. Search, filter, and drill in for runbook details.
            </p>
          </div>
        </div>
        {canCreate && <CreateClientDialog members={allMembers} />}
      </div>

      {data.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No clients yet</CardTitle>
            <CardDescription>
              Create your first client to start building out the runbook.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
        <ClientList rows={data} />
      )}
    </div>
  );
}
