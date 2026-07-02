"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createMailbox,
  deleteMailbox,
  updateMailbox,
} from "@/server/actions/client-runbook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind =
  | "user"
  | "shared"
  | "service"
  | "distribution_list"
  | "security_group"
  | "mail_enabled_security"
  | "external_contact"
  | "other";

const KIND_LABEL: Record<Kind, string> = {
  user: "User",
  shared: "Shared",
  service: "Service",
  distribution_list: "Distribution list",
  security_group: "Security group",
  mail_enabled_security: "Mail-enabled security",
  external_contact: "External contact",
  other: "Other",
};

const KIND_ORDER: Kind[] = [
  "user",
  "shared",
  "service",
  "distribution_list",
  "mail_enabled_security",
  "security_group",
  "external_contact",
  "other",
];

export type MailboxRow = {
  id: string;
  primaryEmail: string;
  displayName: string | null;
  kind: Kind;
  aliases: string[];
  litigationHold: boolean;
  licenseSummary: string | null;
  delegatedToEmail: string | null;
  notes: string | null;
};

export function ClientMailboxesCard({
  clientId,
  mailboxes,
  canEdit,
}: {
  clientId: string;
  mailboxes: MailboxRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mailboxes;
    return mailboxes.filter(
      (m) =>
        m.primaryEmail.toLowerCase().includes(q) ||
        (m.displayName?.toLowerCase().includes(q) ?? false) ||
        m.aliases.some((a) => a.toLowerCase().includes(q)),
    );
  }, [mailboxes, query]);

  const grouped = useMemo(() => {
    const g = new Map<Kind, MailboxRow[]>();
    for (const m of filtered) {
      const arr = g.get(m.kind) ?? [];
      arr.push(m);
      g.set(m.kind, arr);
    }
    for (const [, arr] of g) arr.sort((a, b) => a.primaryEmail.localeCompare(b.primaryEmail));
    return g;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of mailboxes) c[m.kind] = (c[m.kind] ?? 0) + 1;
    return c;
  }, [mailboxes]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Mailbox inventory</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {mailboxes.length} total
              {Object.keys(counts).length > 0 && (
                <span>
                  {" — "}
                  {KIND_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${KIND_LABEL[k].toLowerCase()}`).join(" · ")}
                </span>
              )}
            </p>
          </div>
          {canEdit && !adding && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 size-3.5" /> Add Mailbox
            </Button>
          )}
        </div>
        {mailboxes.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, name, or alias…"
              className="pl-9"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <MailboxForm
            clientId={clientId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {mailboxes.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No mailboxes yet. Track user / shared / service mailboxes plus
            distribution lists and security groups here.
          </p>
        )}
        {KIND_ORDER.filter((k) => grouped.has(k)).map((kind) => (
          <div key={kind} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[kind]} ({(grouped.get(kind) ?? []).length})
            </h3>
            <ul className="divide-y rounded-md border">
              {(grouped.get(kind) ?? []).map((m) =>
                editingId === m.id ? (
                  <li key={m.id} className="p-3">
                    <MailboxForm
                      clientId={clientId}
                      mailbox={m}
                      onDone={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <MailboxRowView
                    key={m.id}
                    clientId={clientId}
                    mailbox={m}
                    canEdit={canEdit}
                    onEdit={() => setEditingId(m.id)}
                  />
                ),
              )}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MailboxRowView({
  clientId,
  mailbox,
  canEdit,
  onEdit,
}: {
  clientId: string;
  mailbox: MailboxRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove ${mailbox.primaryEmail}?`)) return;
    start(async () => {
      const r = await deleteMailbox({ mailboxId: mailbox.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Mailbox removed");
        router.refresh();
      }
    });
  };
  return (
    <li className="flex items-start justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{mailbox.primaryEmail}</span>
          {mailbox.displayName && (
            <span className="text-xs text-muted-foreground">
              ({mailbox.displayName})
            </span>
          )}
          {mailbox.litigationHold && (
            <Badge variant="secondary" className="text-[10px] uppercase">
              Litigation hold
            </Badge>
          )}
        </div>
        {mailbox.aliases.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            {mailbox.aliases.map((a) => (
              <code key={a} className="rounded bg-muted px-1 py-0.5">
                {a}
              </code>
            ))}
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
          {mailbox.licenseSummary && <span>License: {mailbox.licenseSummary}</span>}
          {mailbox.delegatedToEmail && (
            <span>Delegated → {mailbox.delegatedToEmail}</span>
          )}
        </div>
        {mailbox.notes && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {mailbox.notes}
          </p>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
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
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function MailboxForm({
  clientId,
  mailbox,
  onDone,
  onCancel,
}: {
  clientId: string;
  mailbox?: MailboxRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [primaryEmail, setPrimaryEmail] = useState(mailbox?.primaryEmail ?? "");
  const [displayName, setDisplayName] = useState(mailbox?.displayName ?? "");
  const [kind, setKind] = useState<Kind>(mailbox?.kind ?? "user");
  const [aliases, setAliases] = useState<string[]>(mailbox?.aliases ?? []);
  const [litigationHold, setLitigationHold] = useState(mailbox?.litigationHold ?? false);
  const [licenseSummary, setLicenseSummary] = useState(mailbox?.licenseSummary ?? "");
  const [delegatedToEmail, setDelegatedToEmail] = useState(
    mailbox?.delegatedToEmail ?? "",
  );
  const [notes, setNotes] = useState(mailbox?.notes ?? "");

  const submit = () => {
    if (!primaryEmail.trim()) {
      toast.error("Primary email is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        primaryEmail: primaryEmail.trim(),
        displayName: displayName.trim() || null,
        kind,
        aliases: aliases.map((a) => a.trim()).filter(Boolean),
        litigationHold,
        licenseSummary: licenseSummary.trim() || null,
        delegatedToEmail: delegatedToEmail.trim() || null,
        notes: notes.trim() || null,
      };
      const r = mailbox
        ? await updateMailbox({ ...payload, mailboxId: mailbox.id })
        : await createMailbox(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(mailbox ? "Mailbox updated" : "Mailbox added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Primary email</Label>
          <Input
            type="email"
            value={primaryEmail}
            onChange={(e) => setPrimaryEmail(e.target.value)}
          />
        </div>
        <div>
          <Label>Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>License summary</Label>
          <Input
            value={licenseSummary}
            onChange={(e) => setLicenseSummary(e.target.value)}
            placeholder="License summary"
          />
        </div>
        <div>
          <Label>Delegated to</Label>
          <Input
            type="email"
            value={delegatedToEmail}
            onChange={(e) => setDelegatedToEmail(e.target.value)}
            placeholder="manager@example.com"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={litigationHold}
              onChange={(e) => setLitigationHold(e.target.checked)}
            />
            Litigation hold
          </label>
        </div>
      </div>

      <div>
        <Label>Aliases (SMTP)</Label>
        <div className="space-y-1.5">
          {aliases.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={a}
                onChange={(e) => {
                  const next = [...aliases];
                  next[i] = e.target.value;
                  setAliases(next);
                }}
                placeholder="alias@domain.com"
                className="h-9"
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => setAliases(aliases.filter((_, j) => j !== i))}
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
            onClick={() => setAliases([...aliases, ""])}
          >
            <Plus className="mr-1 size-3" /> Add alias
          </Button>
        </div>
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
          {pending ? "Saving…" : mailbox ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
