import { Settings } from "lucide-react";
import { requireContext } from "@/lib/auth-helpers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  const ctx = await requireContext();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="hidden rounded-lg bg-primary/10 p-3 sm:block">
          <Settings className="size-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization</h1>
          <p className="text-muted-foreground">High-level details for {ctx.organization.name}.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Organization-level settings UI will land in a follow-up — this is the placeholder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <Field label="Name">{ctx.organization.name}</Field>
            <Field label="Slug">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {ctx.organization.slug}
              </code>
            </Field>
            <Field label="Primary domain">{ctx.organization.primaryDomain ?? "—"}</Field>
            <Field label="Timezone">{ctx.organization.timezone}</Field>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
