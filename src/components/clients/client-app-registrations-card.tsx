"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createAppRegistration,
  deleteAppRegistration,
  updateAppRegistration,
} from "@/server/actions/client-runbook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CredStatus = "current" | "expiring_soon" | "expired" | "no_secret" | "unknown";
type AppStatus = "active" | "stale" | "to_review" | "to_remove" | "removed";

const CRED_VARIANT: Record<CredStatus, "default" | "secondary" | "outline" | "destructive"> = {
  current: "default",
  expiring_soon: "secondary",
  expired: "destructive",
  no_secret: "outline",
  unknown: "outline",
};

const CRED_LABEL: Record<CredStatus, string> = {
  current: "Current",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_secret: "No secret",
  unknown: "Unknown",
};

const STATUS_VARIANT: Record<AppStatus, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  stale: "secondary",
  to_review: "secondary",
  to_remove: "destructive",
  removed: "outline",
};

const STATUS_LABEL: Record<AppStatus, string> = {
  active: "Active",
  stale: "Stale",
  to_review: "To review",
  to_remove: "To remove",
  removed: "Removed",
};

export type AppRegRow = {
  id: string;
  applicationId: string | null;
  displayName: string;
  appCreatedAt: string | null;
  secretStatus: CredStatus;
  secretExpiresAt: string | null;
  certStatus: CredStatus;
  certExpiresAt: string | null;
  status: AppStatus;
  purpose: string | null;
  flagForReview: boolean;
  notes: string | null;
};

export function ClientAppRegistrationsCard({
  clientId,
  appRegistrations,
  canEdit,
}: {
  clientId: string;
  appRegistrations: AppRegRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const flagged = appRegistrations.filter((a) => a.flagForReview).length;
  const expiring = appRegistrations.filter(
    (a) =>
      a.secretStatus === "expiring_soon" ||
      a.secretStatus === "expired" ||
      a.certStatus === "expiring_soon" ||
      a.certStatus === "expired",
  ).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Entra / OAuth app registrations</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {appRegistrations.length} total
            {flagged > 0 && ` · ${flagged} flagged for review`}
            {expiring > 0 && ` · ${expiring} with credential issues`}
          </p>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Registration
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <AppRegForm
            clientId={clientId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {appRegistrations.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No app registrations tracked yet. Add Entra app registrations
            (Microsoft Graph, partner SSO, etc.) so credential expirations and
            cleanup candidates surface.
          </p>
        )}
        {appRegistrations.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Display name</th>
                  <th className="px-3 py-1.5 font-medium">App ID</th>
                  <th className="px-3 py-1.5 font-medium">Created</th>
                  <th className="px-3 py-1.5 font-medium">Secret</th>
                  <th className="px-3 py-1.5 font-medium">Cert</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {appRegistrations.map((a) =>
                  editingId === a.id ? (
                    <tr key={a.id}>
                      <td colSpan={7} className="p-3">
                        <AppRegForm
                          clientId={clientId}
                          appReg={a}
                          onDone={() => setEditingId(null)}
                          onCancel={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <AppRegRowView
                      key={a.id}
                      clientId={clientId}
                      appReg={a}
                      canEdit={canEdit}
                      onEdit={() => setEditingId(a.id)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AppRegRowView({
  clientId,
  appReg,
  canEdit,
  onEdit,
}: {
  clientId: string;
  appReg: AppRegRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${appReg.displayName}"?`)) return;
    start(async () => {
      const r = await deleteAppRegistration({
        appRegistrationId: appReg.id,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Registration removed");
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{appReg.displayName}</span>
          {appReg.flagForReview && (
            <Badge variant="outline" className="text-[10px]">
              <AlertTriangle className="mr-0.5 size-3" /> Review
            </Badge>
          )}
        </div>
        {appReg.purpose && (
          <div className="text-[10px] text-muted-foreground">{appReg.purpose}</div>
        )}
        {appReg.notes && (
          <div className="text-[10px] text-muted-foreground">{appReg.notes}</div>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
        {appReg.applicationId ?? "—"}
      </td>
      <td className="px-3 py-2 tabular-nums">{appReg.appCreatedAt ?? "—"}</td>
      <td className="px-3 py-2">
        <Badge
          variant={CRED_VARIANT[appReg.secretStatus]}
          className="text-[10px] uppercase"
        >
          {CRED_LABEL[appReg.secretStatus]}
        </Badge>
        {appReg.secretExpiresAt && (
          <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
            exp {appReg.secretExpiresAt}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <Badge
          variant={CRED_VARIANT[appReg.certStatus]}
          className="text-[10px] uppercase"
        >
          {CRED_LABEL[appReg.certStatus]}
        </Badge>
        {appReg.certExpiresAt && (
          <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
            exp {appReg.certExpiresAt}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <Badge
          variant={STATUS_VARIANT[appReg.status]}
          className="text-[10px] uppercase"
        >
          {STATUS_LABEL[appReg.status]}
        </Badge>
      </td>
      <td className="px-3 py-2 text-right">
        {canEdit && (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={pending}
              aria-label="Remove"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function AppRegForm({
  clientId,
  appReg,
  onDone,
  onCancel,
}: {
  clientId: string;
  appReg?: AppRegRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [displayName, setDisplayName] = useState(appReg?.displayName ?? "");
  const [applicationId, setApplicationId] = useState(appReg?.applicationId ?? "");
  const [appCreatedAt, setAppCreatedAt] = useState(appReg?.appCreatedAt ?? "");
  const [secretStatus, setSecretStatus] = useState<CredStatus>(
    appReg?.secretStatus ?? "unknown",
  );
  const [secretExpiresAt, setSecretExpiresAt] = useState(appReg?.secretExpiresAt ?? "");
  const [certStatus, setCertStatus] = useState<CredStatus>(
    appReg?.certStatus ?? "unknown",
  );
  const [certExpiresAt, setCertExpiresAt] = useState(appReg?.certExpiresAt ?? "");
  const [status, setStatus] = useState<AppStatus>(appReg?.status ?? "active");
  const [purpose, setPurpose] = useState(appReg?.purpose ?? "");
  const [flagForReview, setFlagForReview] = useState(appReg?.flagForReview ?? false);
  const [notes, setNotes] = useState(appReg?.notes ?? "");

  const submit = () => {
    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        applicationId: applicationId.trim() || null,
        displayName: displayName.trim(),
        appCreatedAt: appCreatedAt || null,
        secretStatus,
        secretExpiresAt: secretExpiresAt || null,
        certStatus,
        certExpiresAt: certExpiresAt || null,
        status,
        purpose: purpose.trim() || null,
        flagForReview,
        notes: notes.trim() || null,
      };
      const r = appReg
        ? await updateAppRegistration({ ...payload, appRegistrationId: appReg.id })
        : await createAppRegistration(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(appReg ? "Registration updated" : "Registration added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <Label>Application (client) ID</Label>
          <Input
            value={applicationId}
            onChange={(e) => setApplicationId(e.target.value)}
            placeholder="UUID"
          />
        </div>
        <div>
          <Label>Created in tenant</Label>
          <Input
            type="date"
            value={appCreatedAt}
            onChange={(e) => setAppCreatedAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AppStatus)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(STATUS_LABEL) as AppStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <div>
          <Label>Secret status</Label>
          <select
            value={secretStatus}
            onChange={(e) => setSecretStatus(e.target.value as CredStatus)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(CRED_LABEL) as CredStatus[]).map((c) => (
              <option key={c} value={c}>
                {CRED_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Secret expires</Label>
          <Input
            type="date"
            value={secretExpiresAt}
            onChange={(e) => setSecretExpiresAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Cert status</Label>
          <select
            value={certStatus}
            onChange={(e) => setCertStatus(e.target.value as CredStatus)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(CRED_LABEL) as CredStatus[]).map((c) => (
              <option key={c} value={c}>
                {CRED_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Cert expires</Label>
          <Input
            type="date"
            value={certExpiresAt}
            onChange={(e) => setCertExpiresAt(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={flagForReview}
          onChange={(e) => setFlagForReview(e.target.checked)}
        />
        Flag for review
      </label>
      <div>
        <Label>Purpose</Label>
        <Input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="What this app registration is used for"
        />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : appReg ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
