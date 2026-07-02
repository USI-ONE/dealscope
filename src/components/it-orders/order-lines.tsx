"use client";

/**
 * Line items editor for an IT Order. Add / edit / delete rows with
 * category, description, SKU, quantity, unit price. Serial numbers /
 * asset tags get captured per-line during configuration.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addItOrderLine,
  deleteItOrderLine,
  updateItOrderLine,
} from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IT_ORDER_LINE_CATEGORY_LABEL } from "@/db/schema";

type Category =
  | "hardware"
  | "software"
  | "peripheral"
  | "service"
  | "subscription"
  | "consumable"
  | "other";

export type LineRow = {
  id: string;
  category: string;
  description: string;
  sku: string | null;
  quantity: number;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  receivedQuantity: number | null;
  serials: Array<{
    serial: string;
    assetTag?: string;
    hostname?: string;
    notes?: string;
  }>;
  notes: string | null;
};

export function OrderLines({
  orderId,
  lines,
  canEdit,
}: {
  orderId: string;
  lines: LineRow[];
  canEdit: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="space-y-2">
      {lines.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">
          No line items yet. Add what&apos;s being ordered.
        </p>
      )}

      {lines.map((l) => (
        <LineCard key={l.id} orderId={orderId} line={l} canEdit={canEdit} />
      ))}

      {canEdit && !showAdd && (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 size-3.5" /> Add line
        </Button>
      )}

      {canEdit && showAdd && (
        <LineForm
          orderId={orderId}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function LineCard({
  orderId,
  line,
  canEdit,
}: {
  orderId: string;
  line: LineRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing) {
    return (
      <div className="rounded border bg-muted/10 p-2">
        <LineForm
          orderId={orderId}
          line={line}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }
  const unit =
    line.unitPriceCents != null
      ? `$${(line.unitPriceCents / 100).toLocaleString()}`
      : "—";
  const total =
    line.lineTotalCents != null
      ? `$${(line.lineTotalCents / 100).toLocaleString()}`
      : "—";
  return (
    <div className="rounded border bg-card p-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{line.description}</span>
            <span className="rounded bg-muted/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {IT_ORDER_LINE_CATEGORY_LABEL[line.category] ?? line.category}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
              ×{line.quantity}
            </span>
            {line.receivedQuantity != null && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                {line.receivedQuantity}/{line.quantity} received
              </span>
            )}
          </div>
          {line.sku && (
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              SKU: {line.sku}
            </div>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {unit} × {line.quantity} = {total}
          </div>
          {line.serials.length > 0 && (
            <div className="mt-1 space-y-0.5 rounded bg-muted/30 p-1.5 text-xs">
              <div className="font-medium">
                Serials / asset tags ({line.serials.length})
              </div>
              {line.serials.map((s, i) => (
                <div key={i} className="font-mono text-[11px]">
                  {[
                    s.serial && `s/n ${s.serial}`,
                    s.assetTag && `tag ${s.assetTag}`,
                    s.hostname && `host ${s.hostname}`,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                  {s.notes && <span className="ml-2 text-muted-foreground">— {s.notes}</span>}
                </div>
              ))}
            </div>
          )}
          {line.notes && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {line.notes}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!confirm("Delete this line?")) return;
                start(async () => {
                  const r = await deleteItOrderLine({
                    lineId: line.id,
                    orderId,
                  });
                  if (r?.serverError) {
                    toast.error(r.serverError);
                    return;
                  }
                  toast.success("Deleted");
                  router.refresh();
                });
              }}
              disabled={pending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function LineForm({
  orderId,
  line,
  onClose,
}: {
  orderId: string;
  line?: LineRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [category, setCategory] = useState<Category>(
    (line?.category as Category) ?? "hardware",
  );
  const [description, setDescription] = useState(line?.description ?? "");
  const [sku, setSku] = useState(line?.sku ?? "");
  const [quantity, setQuantity] = useState(String(line?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(
    line?.unitPriceCents != null
      ? String(line.unitPriceCents / 100)
      : "",
  );
  const [receivedQty, setReceivedQty] = useState(
    line?.receivedQuantity != null ? String(line.receivedQuantity) : "",
  );
  const [notes, setNotes] = useState(line?.notes ?? "");
  const [serials, setSerials] = useState(line?.serials ?? []);

  const submit = () => {
    if (description.trim().length < 1) {
      toast.error("Description required");
      return;
    }
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty < 1) {
      toast.error("Quantity must be 1 or more");
      return;
    }
    const unitPriceCents = unitPrice
      ? Math.round(Number(unitPrice) * 100)
      : null;
    const receivedQuantity = receivedQty
      ? Number(receivedQty)
      : null;

    start(async () => {
      const payload = {
        category,
        description,
        sku: sku || null,
        quantity: qty,
        unitPriceCents,
        receivedQuantity,
        notes: notes || null,
      };
      if (line) {
        const r = await updateItOrderLine({
          lineId: line.id,
          orderId,
          ...payload,
          serials,
        });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
      } else {
        const r = await addItOrderLine({ orderId, ...payload });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
      }
      toast.success("Saved");
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr]">
        <div>
          <Label className="text-xs">Category</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="hardware">Hardware</option>
            <option value="software">Software</option>
            <option value="peripheral">Peripheral</option>
            <option value="service">Service</option>
            <option value="subscription">Subscription</option>
            <option value="consumable">Consumable</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='"Dell Latitude 5450, 16GB RAM, 512GB SSD"'
            autoFocus
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div>
          <Label className="text-xs">SKU</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Quantity</Label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Unit price ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Received qty</Label>
          <Input
            type="number"
            min={0}
            value={receivedQty}
            onChange={(e) => setReceivedQty(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {line && (
        <SerialsEditor
          quantity={Number(quantity) || 1}
          serials={serials}
          onChange={setSerials}
        />
      )}
      <div className="flex justify-end gap-2 border-t pt-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : line ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function SerialsEditor({
  quantity,
  serials,
  onChange,
}: {
  quantity: number;
  serials: LineRow["serials"];
  onChange: (next: LineRow["serials"]) => void;
}) {
  return (
    <div className="space-y-1 rounded border bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          Serials / asset tags (capture during configuration)
        </Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([
              ...serials,
              { serial: "", assetTag: "", hostname: "", notes: "" },
            ])
          }
          disabled={serials.length >= quantity}
        >
          <Plus className="mr-1 size-3.5" /> Add
        </Button>
      </div>
      {serials.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Add up to {quantity} entries — one per unit.
        </p>
      )}
      {serials.map((s, i) => (
        <div
          key={i}
          className="grid grid-cols-1 gap-1 sm:grid-cols-[1fr_1fr_1fr_2fr_auto]"
        >
          <Input
            value={s.serial}
            onChange={(e) => {
              const next = [...serials];
              next[i] = { ...next[i], serial: e.target.value };
              onChange(next);
            }}
            placeholder="Serial"
            className="h-8 text-xs"
          />
          <Input
            value={s.assetTag ?? ""}
            onChange={(e) => {
              const next = [...serials];
              next[i] = { ...next[i], assetTag: e.target.value };
              onChange(next);
            }}
            placeholder="Asset tag"
            className="h-8 text-xs"
          />
          <Input
            value={s.hostname ?? ""}
            onChange={(e) => {
              const next = [...serials];
              next[i] = { ...next[i], hostname: e.target.value };
              onChange(next);
            }}
            placeholder="Hostname"
            className="h-8 text-xs"
          />
          <Input
            value={s.notes ?? ""}
            onChange={(e) => {
              const next = [...serials];
              next[i] = { ...next[i], notes: e.target.value };
              onChange(next);
            }}
            placeholder="Notes"
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(serials.filter((_, j) => j !== i))}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
