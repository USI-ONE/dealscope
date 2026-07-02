"use client";

/**
 * Project stakeholders — client-side people on the engagement.
 *
 * Distinct from USI's internal members (assignees on tasks/milestones).
 * This is the CEO sponsor, the finance contact, the IT lead, etc. —
 * the actual people we're working WITH at the client.
 *
 * The primary stakeholder shows up in the project header. Only one row
 * can be primary per project; the server action handles the demotion.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  Phone,
  Plus,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createStakeholder,
  deleteStakeholder,
  updateStakeholder,
} from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type Stakeholder = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  roleLabel: string | null;
  isPrimary: boolean;
  notes: string | null;
};

export function ProjectStakeholdersCard({
  projectId,
  stakeholders,
  canEdit,
}: {
  projectId: string;
  stakeholders: Stakeholder[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const ordered = [...stakeholders].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4" />
            Stakeholders
            {stakeholders.length > 0 && (
              <Badge variant="secondary">{stakeholders.length}</Badge>
            )}
          </CardTitle>
          {canEdit && !adding && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdding(true)}
              disabled={pending}
            >
              <Plus className="mr-1 size-3.5" /> Add stakeholder
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <StakeholderForm
            projectId={projectId}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              router.refresh();
            }}
            pending={pending}
            start={start}
          />
        )}

        {ordered.length === 0 && !adding && (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No stakeholders yet. Add the client-side people we&apos;re
            working with — sponsor, technical lead, finance contact.
          </div>
        )}

        {ordered.map((s) =>
          editingId === s.id ? (
            <StakeholderForm
              key={s.id}
              projectId={projectId}
              initial={s}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                setEditingId(null);
                router.refresh();
              }}
              pending={pending}
              start={start}
            />
          ) : (
            <StakeholderRow
              key={s.id}
              stakeholder={s}
              canEdit={canEdit}
              pending={pending}
              onEdit={() => setEditingId(s.id)}
              onDelete={() => {
                if (
                  !confirm(`Remove ${s.name} from the project stakeholder list?`)
                )
                  return;
                start(async () => {
                  const r = await deleteStakeholder({ stakeholderId: s.id });
                  if (r?.serverError) {
                    toast.error(r.serverError);
                    return;
                  }
                  router.refresh();
                });
              }}
              onTogglePrimary={() => {
                start(async () => {
                  const r = await updateStakeholder({
                    stakeholderId: s.id,
                    isPrimary: !s.isPrimary,
                  });
                  if (r?.serverError) {
                    toast.error(r.serverError);
                    return;
                  }
                  router.refresh();
                });
              }}
            />
          ),
        )}
      </CardContent>
    </Card>
  );
}

function StakeholderRow({
  stakeholder: s,
  canEdit,
  pending,
  onEdit,
  onDelete,
  onTogglePrimary,
}: {
  stakeholder: Stakeholder;
  canEdit: boolean;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePrimary: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(s.email || s.phone || s.notes);

  return (
    <div className="rounded-md border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{s.name}</span>
            {s.isPrimary && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <Star className="mr-1 size-3 fill-current" /> Primary
              </Badge>
            )}
            {s.roleLabel && (
              <Badge variant="outline" className="text-xs">
                {s.roleLabel}
              </Badge>
            )}
          </div>
          {s.title && (
            <div className="text-xs text-muted-foreground">{s.title}</div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            {s.email && (
              <a
                href={`mailto:${s.email}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Mail className="size-3" /> {s.email}
              </a>
            )}
            {s.phone && (
              <a
                href={`tel:${s.phone}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Phone className="size-3" /> {s.phone}
              </a>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onTogglePrimary}
              disabled={pending}
              className={`h-7 text-xs ${s.isPrimary ? "text-amber-600" : "text-muted-foreground hover:text-amber-600"}`}
              title={s.isPrimary ? "Remove primary flag" : "Set as primary"}
            >
              <Star className={`size-3.5 ${s.isPrimary ? "fill-current" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              disabled={pending}
              className="h-7 text-xs"
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={pending}
              className="h-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {hasDetail && s.notes && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 border-t px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted/30"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            Notes
          </button>
          {expanded && (
            <div className="border-t bg-muted/10 px-3 py-2 text-sm whitespace-pre-wrap">
              {s.notes}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StakeholderForm({
  projectId,
  initial,
  onCancel,
  onSaved,
  pending,
  start,
}: {
  projectId: string;
  initial?: Stakeholder;
  onCancel: () => void;
  onSaved: () => void;
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [roleLabel, setRoleLabel] = useState(initial?.roleLabel ?? "");
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Stakeholder name is required");
      return;
    }
    start(async () => {
      const result = initial
        ? await updateStakeholder({
            stakeholderId: initial.id,
            name,
            title: title || null,
            email: email || null,
            phone: phone || null,
            roleLabel: roleLabel || null,
            isPrimary,
            notes: notes || null,
          })
        : await createStakeholder({
            projectId,
            name,
            title: title || null,
            email: email || null,
            phone: phone || null,
            roleLabel: roleLabel || null,
            isPrimary,
            notes: notes || null,
          });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      toast.success(initial ? "Stakeholder updated" : "Stakeholder added");
      onSaved();
    });
  };

  return (
    <form
      className="space-y-3 rounded-md border border-dashed bg-muted/20 p-3"
      onSubmit={onSubmit}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1 block text-xs">Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Britney De Jong"
            autoFocus
            required
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. CEO"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Role on project</Label>
          <Input
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder="Sponsor / Technical lead / Finance contact"
          />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Primary contact (appears in project header)
          </label>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@client.com"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Phone</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(801) 555-0123"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="mb-1 block text-xs">Notes</Label>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything we need to remember — best contact hours, prefers text, escalation path…"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} type="button">
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : null}
          {initial ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}
