"use client";

/**
 * Attachments register for an IT Order. Captures URLs (SharePoint /
 * OneDrive / file paths) — direct file upload is deferred; the link is
 * fine for sales orders, POs, invoices.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addItOrderAttachment,
  removeItOrderAttachment,
} from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IT_ORDER_ATTACHMENT_KIND_LABEL } from "@/db/schema";

type Kind =
  | "quote"
  | "sales_order"
  | "purchase_order"
  | "invoice"
  | "packing_slip"
  | "approval_evidence"
  | "configuration_notes"
  | "completion_evidence"
  | "other";

export type AttachmentRow = {
  id: string;
  kind: string;
  label: string;
  url: string | null;
  filename: string | null;
  notes: string | null;
  uploadedAt: Date | string;
  uploadedByName: string | null;
};

export function AttachmentsManager({
  orderId,
  attachments,
  canEdit,
}: {
  orderId: string;
  attachments: AttachmentRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<Kind>("sales_order");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (label.trim().length < 1) {
      toast.error("Label required");
      return;
    }
    start(async () => {
      const r = await addItOrderAttachment({
        orderId,
        kind,
        label,
        url: url || null,
        notes: notes || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Added");
      setShowAdd(false);
      setLabel("");
      setUrl("");
      setNotes("");
      setKind("sales_order");
      router.refresh();
    });
  };

  const remove = (id: string) => {
    if (!confirm("Remove this attachment?")) return;
    start(async () => {
      const r = await removeItOrderAttachment({ attachmentId: id });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No attachments yet. Upload (or paste links to) the sales order,
          PO, packing slip, and any approval evidence.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded border bg-card p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{a.label}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {IT_ORDER_ATTACHMENT_KIND_LABEL[a.kind] ?? a.kind}
                  </span>
                </div>
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {a.url}
                    <ExternalLink className="size-3" />
                  </a>
                )}
                {a.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {a.notes}
                  </p>
                )}
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(a.uploadedAt).toLocaleString()}
                  {a.uploadedByName ? ` · ${a.uploadedByName}` : ""}
                </div>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(a.id)}
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !showAdd && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="mr-1 size-3.5" /> Add attachment
        </Button>
      )}

      {canEdit && showAdd && (
        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[14rem_1fr]">
            <div>
              <Label className="text-xs">Kind</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="quote">Quote</option>
                <option value="sales_order">Sales order</option>
                <option value="purchase_order">Purchase order</option>
                <option value="invoice">Invoice</option>
                <option value="packing_slip">Packing slip</option>
                <option value="approval_evidence">Client approval evidence</option>
                <option value="configuration_notes">Configuration notes</option>
                <option value="completion_evidence">Completion evidence</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='"Dell quote Q-12345"'
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Link (URL)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="SharePoint URL, OneDrive link, file path, etc."
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdd(false)}
              disabled={pending}
            >
              <X className="mr-1 size-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
