import { asc, eq } from "drizzle-orm";
import { Cable, AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { isSyncroConfigured, listAllCustomers, testConnection } from "@/lib/syncro";
import { syncroCustomerDisplayName } from "@/lib/syncro";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncroCustomerTable } from "@/components/settings/syncro-customer-table";
import type { SyncroCustomerCompareRow } from "@/server/actions/syncro";

export const metadata = { title: "Syncro Integration" };
export const dynamic = "force-dynamic";

export default async function SyncroIntegrationPage() {
  // Anyone owner+ can view this; manager+ can pull.
  const ctx = await requireRole("manager");

  const configured = isSyncroConfigured();
  const test = configured ? await testConnection() : null;

  let initialRows: SyncroCustomerCompareRow[] = [];
  let allClients: { id: string; name: string }[] = [];

  if (configured && test?.ok) {
    const [customers, existing] = await Promise.all([
      listAllCustomers().catch(() => []),
      db
        .select({
          id: clients.id,
          name: clients.name,
          syncroCustomerId: clients.syncroCustomerId,
        })
        .from(clients)
        .where(eq(clients.organizationId, ctx.organization.id))
        .orderBy(asc(clients.name)),
    ]);
    const byId = new Map(
      existing
        .filter((c) => c.syncroCustomerId)
        .map((c) => [c.syncroCustomerId!, c] as const),
    );
    initialRows = customers.map((c) => {
      const linked = byId.get(String(c.id));
      return {
        syncroId: c.id,
        displayName: syncroCustomerDisplayName(c),
        email: c.email,
        city: c.city,
        state: c.state,
        matchedClientId: linked?.id ?? null,
        matchedClientName: linked?.name ?? null,
      };
    });
    allClients = existing
      .filter((c) => !c.syncroCustomerId)
      .map((c) => ({ id: c.id, name: c.name }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="hidden rounded-lg bg-primary/10 p-3 sm:block">
          <Cable className="size-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Syncro</h1>
          <p className="text-muted-foreground">
            One-way pull from Syncro MSP. Customers and RMM-managed assets flow into
            TechOS as clients and hardware. Use this to keep the TechOS runbook +
            billing in sync with Syncro&apos;s operational truth.
          </p>
        </div>
      </div>

      {!configured ? (
        <Card className="border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10">
          <CardHeader>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-1 size-5 text-amber-700 dark:text-amber-400" />
              <div>
                <CardTitle>Not configured</CardTitle>
                <CardDescription>
                  Syncro credentials aren&apos;t set. An owner needs to configure two
                  environment variables in Vercel:
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="ml-4 list-disc space-y-1 text-sm">
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  SYNCRO_SUBDOMAIN
                </code>
                {" — the prefix in "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  https://&lt;sub&gt;.syncromsp.com
                </code>
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  SYNCRO_API_KEY
                </code>
                {" — generate at Syncro → Admin → API → New API Token. Required scopes:"}
                <em> Customer - List/Read</em>, <em>Asset - List/Read</em>.
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              From a checkout with .vercel/ linked, run:
            </p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`node scripts/set-env.mjs SYNCRO_SUBDOMAIN <yoursubdomain>
node scripts/set-env.mjs SYNCRO_API_KEY <yourapikey>
vercel --prod --yes`}
            </pre>
          </CardContent>
        </Card>
      ) : test && !test.ok ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Connection failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{test.error}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Verify the subdomain + API key, and that the token has Customer +
              Asset list/read scopes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-green-300 bg-green-50/30 dark:border-green-800 dark:bg-green-950/10">
            <CardContent className="flex items-center justify-between p-4">
              <div className="text-sm">
                <strong>Connected</strong> — Syncro returned a valid response.
                {test?.ok && test.sample.customerCount != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({test.sample.customerCount} customers in your account)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <SyncroCustomerTable initialRows={initialRows} clients={allClients} />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What syncs today</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <strong>Customers → Clients.</strong> One-way pull, manual trigger. Match by{" "}
            <code className="font-mono text-xs">syncro_customer_id</code>. You choose
            create-new vs. link-to-existing per customer.
          </div>
          <div>
            <strong>Assets → Hardware.</strong> Per-client pull. Match priority: Syncro
            asset id, then serial number, then create. Pulled fields include OS, CPU,
            RAM/disk (where the RMM agent reports them), last IP, last seen, assigned
            user.
          </div>
          <div className="text-muted-foreground text-xs">
            Not synced (yet): tickets, invoices, contracts, scheduled events. Webhook
            receiver and nightly cron land in the next iteration.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
