"use client";

/**
 * Setup form for a per-kind integration. Renders a connector-specific
 * field set, plus "Save", "Test connection", and "Sync now" actions.
 *
 * Each kind declares its config schema as a list of fields below. We
 * could autogenerate from the Zod schemas in src/lib/integrations/*,
 * but keeping the field list explicit here lets us label them, add
 * help text, and decide which to obscure as passwords.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ShieldCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorConnectionKind } from "@/db/schema";
import {
  syncConnection,
  testConnection,
  updateConnectionConfig,
  setConnectionEnabled,
} from "@/server/actions/integrations";

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  options?: string[];
  required?: boolean;
  help?: string;
};

/**
 * Per-kind field schemas — matches the Zod config schema in each
 * connector file. Keep them in lockstep.
 */
const FIELDS: Record<VendorConnectionKind, FieldDef[]> = {
  syncro: [], // Syncro uses env vars; nothing to enter here.
  liongard: [
    {
      key: "baseUrl",
      label: "Base URL",
      type: "url",
      required: true,
      help: "e.g. https://<tenant>.api.liongard.com",
    },
    { key: "accessKeyId", label: "Access Key ID", type: "text", required: true },
    {
      key: "accessKeySecret",
      label: "Access Key Secret",
      type: "password",
      required: true,
    },
  ],
  bitdefender_gravityzone: [
    {
      key: "baseUrl",
      label: "GravityZone URL",
      type: "url",
      required: true,
      help: "e.g. https://cloudgz.gravityzone.bitdefender.com",
    },
    { key: "apiKey", label: "API Key", type: "password", required: true },
  ],
  acronis_cyber_cloud: [
    {
      key: "baseUrl",
      label: "Datacenter URL",
      type: "url",
      required: true,
      help: "e.g. https://us5-cloud.acronis.com",
    },
    { key: "clientId", label: "OAuth Client ID", type: "text", required: true },
    {
      key: "clientSecret",
      label: "OAuth Client Secret",
      type: "password",
      required: true,
    },
    {
      key: "tenantId",
      label: "Partner Tenant ID",
      type: "text",
      required: true,
      help: "Your MSP's root tenant UUID in Acronis.",
    },
  ],
  titanhq: [
    {
      key: "product",
      label: "Product",
      type: "select",
      options: ["spamtitan", "webtitan"],
      required: true,
    },
    {
      key: "baseUrl",
      label: "API Base URL",
      type: "url",
      required: true,
      help: "e.g. https://api.spamtitancloud.com",
    },
    { key: "apiKey", label: "API Key", type: "password", required: true },
  ],
  microsoft_csp: [],
  huntress: [],
  threatlocker: [],
  datto_rmm: [],
  ingram_micro: [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      help: "From Ingram Micro CEP → API Keys. Looks like '3wr...'",
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
      help: "Shown ONCE when the app was generated. Re-create the app in CEP if lost.",
    },
    {
      key: "customerNumber",
      label: "Ingram Customer Number",
      type: "text",
      required: true,
      help: "USI's customer # at Ingram, e.g. '466870'. Also visible as the prefix on your app name (50-466870-TechOS).",
    },
  ],
  unifi_network: [
    {
      key: "apiKey",
      label: "Site Manager API Key",
      type: "password",
      required: true,
      help: "Generate at unifi.ui.com → click your profile (top-right) → API → Create API Key. Stored as X-API-KEY.",
    },
    {
      key: "baseUrl",
      label: "API Base URL",
      type: "url",
      required: false,
      help: "Leave blank unless Ubiquiti moves the endpoint. Default: https://api.ui.com",
    },
  ],
};

type Props = {
  connection: {
    id: string;
    kind: VendorConnectionKind;
    displayName: string;
    status: string;
    enabled: boolean;
    configJson: Record<string, unknown>;
    lastSyncMessage: string | null;
  };
};

export function IntegrationSetupForm({ connection }: Props) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [syncing, startSync] = useTransition();
  const fields = FIELDS[connection.kind] ?? [];

  const [displayName, setDisplayName] = useState(connection.displayName);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = connection.configJson[f.key];
      out[f.key] = typeof v === "string" ? v : "";
    }
    return out;
  });

  const setField = (k: string, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const save = () =>
    startSave(async () => {
      const r = await updateConnectionConfig({
        connectionId: connection.id,
        displayName,
        configJson: values,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Saved");
        router.refresh();
      }
    });

  const runTest = () =>
    startTest(async () => {
      const r = await testConnection({ connectionId: connection.id });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data) {
        if (r.data.ok) toast.success(r.data.message);
        else toast.error(r.data.message);
      }
      router.refresh();
    });

  const runSync = () =>
    startSync(async () => {
      const r = await syncConnection({ connectionId: connection.id });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data) {
        if (r.data.ok) toast.success(r.data.message);
        else toast.error(r.data.message);
      }
      router.refresh();
    });

  const toggleEnabled = () =>
    startSave(async () => {
      const r = await setConnectionEnabled({
        connectionId: connection.id,
        enabled: !connection.enabled,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(connection.enabled ? "Disabled" : "Enabled");
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      {connection.kind === "syncro" ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          Syncro credentials are still loaded from environment variables
          (<code>SYNCRO_SUBDOMAIN</code> / <code>SYNCRO_API_KEY</code>). They
          will migrate to this form on the next pass.
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key}>
                <Label htmlFor={f.key}>
                  {f.label}
                  {f.required && <span className="ml-0.5 text-destructive">*</span>}
                </Label>
                {f.type === "select" ? (
                  <select
                    id={f.key}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— select —</option>
                    {f.options!.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={f.key}
                    type={f.type === "password" ? "password" : "text"}
                    autoComplete={f.type === "password" ? "new-password" : undefined}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                )}
                {f.help && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{f.help}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {connection.kind !== "syncro" && (
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            Save credentials
          </Button>
        )}
        <Button
          onClick={runTest}
          disabled={testing}
          size="sm"
          variant="outline"
        >
          {testing ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="mr-1.5 size-3.5" />
          )}
          Test connection
        </Button>
        <Button
          onClick={runSync}
          disabled={syncing}
          size="sm"
          variant="outline"
        >
          {syncing ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 size-3.5" />
          )}
          Sync now
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {connection.enabled ? "Enabled" : "Disabled"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={toggleEnabled}
            disabled={saving}
          >
            {connection.enabled ? "Disable" : "Enable"}
          </Button>
        </div>
      </div>

      {connection.lastSyncMessage && (
        <p className="text-xs italic text-muted-foreground">
          Last status: {connection.lastSyncMessage}
        </p>
      )}
    </div>
  );
}
