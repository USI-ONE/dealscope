"use client";

/**
 * In-line tree editor for a standard's controls. Domains are collapsible
 * containers (parent_id null); leaf controls live underneath them. Every
 * row has inline edit / delete; "Add domain" + per-domain "Add control"
 * buttons round it out.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createControl,
  deleteControl,
  updateControl,
} from "@/server/actions/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ControlRow = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  guidance: string | null;
  position: number;
};

export function ControlTreeEditor({
  standardId,
  controls,
  canEdit,
}: {
  standardId: string;
  controls: ControlRow[];
  canEdit: boolean;
}) {
  // Group: domains (parent null) → list of leaf controls.
  const domains = controls.filter((c) => c.parentId === null);
  const childrenByParent = new Map<string, ControlRow[]>();
  for (const c of controls) {
    if (c.parentId) {
      const arr = childrenByParent.get(c.parentId) ?? [];
      arr.push(c);
      childrenByParent.set(c.parentId, arr);
    }
  }

  const [showAddDomain, setShowAddDomain] = useState(false);

  return (
    <div className="space-y-4">
      {domains.length === 0 && !showAddDomain && (
        <p className="text-sm text-muted-foreground">
          No domains yet. Add a domain to start grouping controls.
        </p>
      )}
      {domains.map((d) => (
        <DomainBlock
          key={d.id}
          standardId={standardId}
          domain={d}
          controls={childrenByParent.get(d.id) ?? []}
          canEdit={canEdit}
        />
      ))}
      {canEdit && !showAddDomain && (
        <Button variant="outline" size="sm" onClick={() => setShowAddDomain(true)}>
          <Plus className="mr-1 size-3.5" /> Add domain
        </Button>
      )}
      {canEdit && showAddDomain && (
        <NewControlForm
          standardId={standardId}
          parentId={null}
          onClose={() => setShowAddDomain(false)}
          isDomain
        />
      )}
    </div>
  );
}

function DomainBlock({
  standardId,
  domain,
  controls,
  canEdit,
}: {
  standardId: string;
  domain: ControlRow;
  controls: ControlRow[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showAddControl, setShowAddControl] = useState(false);

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-start justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-left"
        >
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <span className="text-xs font-mono text-muted-foreground">
            {domain.code ?? "—"}
          </span>
          <span className="font-semibold">{domain.title}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            ({controls.length} {controls.length === 1 ? "control" : "controls"})
          </span>
        </button>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing((v) => !v)}
              title="Edit domain"
            >
              <Pencil className="size-3.5" />
            </Button>
            <DeleteControlButton controlId={domain.id} standardId={standardId} />
          </div>
        )}
      </div>

      {editing && (
        <div className="border-b px-3 py-2">
          <EditControlForm
            standardId={standardId}
            control={domain}
            onClose={() => setEditing(false)}
          />
        </div>
      )}

      {open && (
        <div className="space-y-1 px-3 py-2">
          {controls.length === 0 ? (
            <p className="text-xs text-muted-foreground">No controls yet.</p>
          ) : (
            controls.map((c) => (
              <ControlRowItem
                key={c.id}
                standardId={standardId}
                control={c}
                canEdit={canEdit}
              />
            ))
          )}
          {canEdit && !showAddControl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddControl(true)}
            >
              <Plus className="mr-1 size-3.5" /> Add control
            </Button>
          )}
          {canEdit && showAddControl && (
            <NewControlForm
              standardId={standardId}
              parentId={domain.id}
              onClose={() => setShowAddControl(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ControlRowItem({
  standardId,
  control,
  canEdit,
}: {
  standardId: string;
  control: ControlRow;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="rounded border bg-muted/10 p-2">
        <EditControlForm
          standardId={standardId}
          control={control}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-2 rounded border bg-card p-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {control.code && (
            <span className="font-mono text-xs text-muted-foreground">
              {control.code}
            </span>
          )}
          <span className="font-medium">{control.title}</span>
        </div>
        {control.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {control.description}
          </p>
        )}
        {control.guidance && (
          <p className="mt-1 rounded bg-muted/30 p-1.5 text-[11px] italic text-muted-foreground">
            What good looks like: {control.guidance}
          </p>
        )}
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            title="Edit control"
          >
            <Pencil className="size-3.5" />
          </Button>
          <DeleteControlButton controlId={control.id} standardId={standardId} />
        </div>
      )}
    </div>
  );
}

function NewControlForm({
  standardId,
  parentId,
  onClose,
  isDomain,
}: {
  standardId: string;
  parentId: string | null;
  onClose: () => void;
  isDomain?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [guidance, setGuidance] = useState("");

  const submit = () => {
    if (title.trim().length < 1) {
      toast.error("Title required");
      return;
    }
    start(async () => {
      const r = await createControl({
        standardId,
        parentId: parentId ?? undefined,
        code: code || null,
        title,
        description: description || null,
        guidance: guidance || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(isDomain ? "Domain added" : "Control added");
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="space-y-2 rounded border bg-muted/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {isDomain ? "New domain" : "New control"}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[7rem_1fr]">
        <div>
          <Label className="text-xs">Code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="1.1"
          />
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isDomain ? "Identity & access" : "MFA on all admin accounts"}
            autoFocus
          />
        </div>
      </div>
      {!isDomain && (
        <>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the control requires."
            />
          </div>
          <div>
            <Label className="text-xs">What good looks like</Label>
            <Textarea
              rows={2}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="The evidence assessors should look for. e.g. 'IdP coverage report shows ≥98% MFA enrollment.'"
            />
          </div>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function EditControlForm({
  standardId,
  control,
  onClose,
}: {
  standardId: string;
  control: ControlRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(control.code ?? "");
  const [title, setTitle] = useState(control.title);
  const [description, setDescription] = useState(control.description ?? "");
  const [guidance, setGuidance] = useState(control.guidance ?? "");

  const submit = () => {
    start(async () => {
      const r = await updateControl({
        controlId: control.id,
        standardId,
        code: code || null,
        title,
        description: description || null,
        guidance: guidance || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Saved");
      onClose();
      router.refresh();
    });
  };

  const isDomain = control.parentId === null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[7rem_1fr]">
        <div>
          <Label className="text-xs">Code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      {!isDomain && (
        <>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">What good looks like</Label>
            <Textarea
              rows={2}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
            />
          </div>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function DeleteControlButton({
  standardId,
  controlId,
}: {
  standardId: string;
  controlId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        if (!confirm("Delete this entry? Linked assessments will also be removed.")) return;
        start(async () => {
          const r = await deleteControl({ standardId, controlId });
          if (r?.serverError) {
            toast.error(r.serverError);
            return;
          }
          toast.success("Deleted");
          router.refresh();
        });
      }}
      disabled={pending}
      title="Delete"
      className="text-destructive hover:text-destructive"
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
