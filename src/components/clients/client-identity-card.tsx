"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { upsertClientIdentity } from "@/server/actions/client-runbook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type IdentityProvider =
  | "entra_id"
  | "google_workspace"
  | "okta"
  | "active_directory"
  | "jumpcloud"
  | "auth0"
  | "other";

type DirectorySync =
  | "none"
  | "entra_connect"
  | "ad_fs"
  | "azure_ad_connect_cloud_sync"
  | "scim"
  | "other";

type MfaPosture =
  | "all_required"
  | "admin_only"
  | "conditional"
  | "not_enforced"
  | "unknown";

const PROVIDER_LABEL: Record<IdentityProvider, string> = {
  entra_id: "Microsoft Entra ID",
  google_workspace: "Google Workspace",
  okta: "Okta",
  active_directory: "On-prem Active Directory",
  jumpcloud: "JumpCloud",
  auth0: "Auth0",
  other: "Other",
};

const SYNC_LABEL: Record<DirectorySync, string> = {
  none: "None — cloud-only",
  entra_connect: "Entra Connect",
  ad_fs: "AD FS",
  azure_ad_connect_cloud_sync: "Azure AD Connect Cloud Sync",
  scim: "SCIM",
  other: "Other",
};

const MFA_LABEL: Record<MfaPosture, string> = {
  all_required: "Required for all users",
  admin_only: "Admin accounts only",
  conditional: "Conditional Access policies",
  not_enforced: "Not enforced",
  unknown: "Unknown — to validate",
};

const MFA_VARIANT: Record<MfaPosture, "default" | "secondary" | "outline" | "destructive"> = {
  all_required: "default",
  admin_only: "secondary",
  conditional: "secondary",
  not_enforced: "destructive",
  unknown: "outline",
};

export type ClientIdentityRow = {
  id: string;
  identityProvider: IdentityProvider;
  primaryDomain: string | null;
  tenantDefaultDomain: string | null;
  tenantId: string | null;
  domainRegistrar: string | null;
  directorySync: DirectorySync;
  mfaPosture: MfaPosture;
  conditionalAccessNotes: string | null;
  ssoConsumers: string[];
  notes: string | null;
};

export function ClientIdentityCard({
  clientId,
  identity,
  canEdit,
}: {
  clientId: string;
  identity: ClientIdentityRow | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(!identity); // open by default if unset

  if (!editing && identity) {
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
          <CardTitle>Identity</CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <Field label="Identity provider">
              {PROVIDER_LABEL[identity.identityProvider]}
            </Field>
            <Field label="MFA posture">
              <Badge variant={MFA_VARIANT[identity.mfaPosture]} className="text-[10px] uppercase">
                {MFA_LABEL[identity.mfaPosture]}
              </Badge>
            </Field>
            <Field label="Primary domain">{identity.primaryDomain ?? "—"}</Field>
            <Field label="Tenant default domain">
              {identity.tenantDefaultDomain ? (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {identity.tenantDefaultDomain}
                </code>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Tenant ID">
              {identity.tenantId ? (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {identity.tenantId}
                </code>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Domain registrar">{identity.domainRegistrar ?? "—"}</Field>
            <Field label="Directory sync">{SYNC_LABEL[identity.directorySync]}</Field>
            <Field label="SSO consumers">
              {identity.ssoConsumers.length === 0 ? (
                "—"
              ) : (
                <div className="flex flex-wrap gap-1">
                  {identity.ssoConsumers.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
          </dl>
          {identity.conditionalAccessNotes && (
            <div className="mt-4 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Conditional Access
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {identity.conditionalAccessNotes}
              </p>
            </div>
          )}
          {identity.notes && (
            <div className="mt-4 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{identity.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return <IdentityForm clientId={clientId} identity={identity ?? undefined} onDone={() => setEditing(false)} canEdit={canEdit} />;
}

function IdentityForm({
  clientId,
  identity,
  onDone,
  canEdit,
}: {
  clientId: string;
  identity?: ClientIdentityRow;
  onDone: () => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [identityProvider, setIdentityProvider] = useState<IdentityProvider>(
    identity?.identityProvider ?? "entra_id",
  );
  const [primaryDomain, setPrimaryDomain] = useState(identity?.primaryDomain ?? "");
  const [tenantDefaultDomain, setTenantDefaultDomain] = useState(
    identity?.tenantDefaultDomain ?? "",
  );
  const [tenantId, setTenantId] = useState(identity?.tenantId ?? "");
  const [domainRegistrar, setDomainRegistrar] = useState(identity?.domainRegistrar ?? "");
  const [directorySync, setDirectorySync] = useState<DirectorySync>(
    identity?.directorySync ?? "none",
  );
  const [mfaPosture, setMfaPosture] = useState<MfaPosture>(
    identity?.mfaPosture ?? "unknown",
  );
  const [conditionalAccessNotes, setConditionalAccessNotes] = useState(
    identity?.conditionalAccessNotes ?? "",
  );
  const [ssoConsumers, setSsoConsumers] = useState<string[]>(
    identity?.ssoConsumers ?? [],
  );
  const [notes, setNotes] = useState(identity?.notes ?? "");

  const save = () => {
    start(async () => {
      const r = await upsertClientIdentity({
        clientId,
        identityProvider,
        primaryDomain: primaryDomain.trim() || null,
        tenantDefaultDomain: tenantDefaultDomain.trim() || null,
        tenantId: tenantId.trim() || null,
        domainRegistrar: domainRegistrar.trim() || null,
        directorySync,
        mfaPosture,
        conditionalAccessNotes: conditionalAccessNotes.trim() || null,
        ssoConsumers: ssoConsumers.map((s) => s.trim()).filter(Boolean),
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Identity saved");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <CardTitle>{identity ? "Edit Identity" : "Identity"}</CardTitle>
        <div className="flex items-center gap-2">
          {identity && (
            <Button variant="outline" size="sm" onClick={onDone} disabled={pending}>
              <X className="mr-1 size-3.5" /> Cancel
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={save} disabled={pending}>
              <Save className="mr-1 size-3.5" /> {pending ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Identity provider</Label>
            <select
              value={identityProvider}
              onChange={(e) => setIdentityProvider(e.target.value as IdentityProvider)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(PROVIDER_LABEL) as IdentityProvider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>MFA posture</Label>
            <select
              value={mfaPosture}
              onChange={(e) => setMfaPosture(e.target.value as MfaPosture)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(MFA_LABEL) as MfaPosture[]).map((m) => (
                <option key={m} value={m}>
                  {MFA_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Primary domain</Label>
            <Input
              value={primaryDomain}
              onChange={(e) => setPrimaryDomain(e.target.value)}
              placeholder="acme.com"
            />
          </div>
          <div>
            <Label>Tenant default domain</Label>
            <Input
              value={tenantDefaultDomain}
              onChange={(e) => setTenantDefaultDomain(e.target.value)}
              placeholder="NETORGFT*.onmicrosoft.com"
            />
          </div>
          <div>
            <Label>Tenant ID</Label>
            <Input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="UUID"
            />
          </div>
          <div>
            <Label>Domain registrar</Label>
            <Input
              value={domainRegistrar}
              onChange={(e) => setDomainRegistrar(e.target.value)}
              placeholder="Domain registrar"
            />
          </div>
          <div>
            <Label>Directory sync</Label>
            <select
              value={directorySync}
              onChange={(e) => setDirectorySync(e.target.value as DirectorySync)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(SYNC_LABEL) as DirectorySync[]).map((s) => (
                <option key={s} value={s}>
                  {SYNC_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <SsoConsumersEditor consumers={ssoConsumers} onChange={setSsoConsumers} />

        <div>
          <Label>Conditional Access notes</Label>
          <Textarea
            rows={3}
            value={conditionalAccessNotes}
            onChange={(e) => setConditionalAccessNotes(e.target.value)}
            placeholder="Policy summary or to-validate items."
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SsoConsumersEditor({
  consumers,
  onChange,
}: {
  consumers: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <Label>SSO consumers (apps using this IdP)</Label>
      <div className="space-y-1.5">
        {consumers.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={c}
              onChange={(e) => {
                const next = [...consumers];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder="App name (one per row)"
              className="h-9"
            />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => onChange(consumers.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => onChange([...consumers, ""])}
        >
          <Plus className="mr-1 size-3" /> Add SSO consumer
        </Button>
      </div>
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
