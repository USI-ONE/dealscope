"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, X } from "lucide-react";
import { ExtractPdfButton } from "./extract-pdf-button";
import { toast } from "sonner";
import {
  allocateBillLineToClient,
  createBillLine,
  deleteBillLine,
  deleteVendorBill,
  updateBillLine,
  updateVendorBill,
} from "@/server/actions/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BillStatus = "received" | "approved" | "paid" | "disputed" | "void";

export type BillRow = {
  id: string;
  vendorId: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  receivedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: BillStatus;
  notes: string | null;
};

export type LineRow = {
  id: string;
  description: string;
  sku: string | null;
  quantity: number | null;
  unitCostCents: number | null;
  totalCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  /** Cost attribution — which client + site this specific line is for. */
  clientId: string | null;
  clientName: string | null;
  locationId: string | null;
  locationLabel: string | null;
  allocated: { clientId: string; clientName: string; rebillCents: number }[];
};

type Client = { id: string; name: string };
type LocationOpt = { id: string; label: string };

export function BillDetail({
  bill,
  lines,
  clients,
  locationsByClient,
  canEdit,
}: {
  bill: BillRow;
  lines: LineRow[];
  clients: Client[];
  /** Map of clientId -> available locations, used to populate the
      Location dropdown per line based on the selected client. */
  locationsByClient: Record<string, LocationOpt[]>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [allocatingLineId, setAllocatingLineId] = useState<string | null>(null);
  const [status, setStatus] = useState<BillStatus>(bill.status);

  const onStatus = (next: BillStatus) => {
    setStatus(next);
    start(async () => {
      const r = await updateVendorBill({ billId: bill.id, status: next });
      if (r?.serverError) {
        toast.error(r.serverError);
        setStatus(bill.status);
      } else {
        toast.success(`Status → ${next}`);
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    if (
      !confirm(
        `Delete this bill and all its lines + billables? This cannot be undone.`,
      )
    )
      return;
    start(async () => {
      const r = await deleteVendorBill({ billId: bill.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Bill deleted");
        router.push("/finance/bills");
      }
    });
  };

  const linesSum = lines.reduce((s, l) => s + l.totalCents, 0);
  const variance = linesSum - bill.subtotalCents;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">{bill.vendorName ?? "Unknown vendor"}</CardTitle>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {bill.invoiceNumber && (
                <span>
                  Invoice <code className="font-mono">{bill.invoiceNumber}</code>
                </span>
              )}
              {bill.periodStart && (
                <span>
                  Period {bill.periodStart}
                  {bill.periodEnd ? ` → ${bill.periodEnd}` : ""}
                </span>
              )}
              {bill.receivedAt && <span>Received {bill.receivedAt}</span>}
              {bill.dueAt && <span>Due {bill.dueAt}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">
                ${(bill.totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                total
              </div>
            </div>
            {canEdit && (
              <select
                value={status}
                onChange={(e) => onStatus(e.target.value as BillStatus)}
                disabled={pending}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs uppercase tracking-wider"
              >
                <option value="received">Received</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="disputed">Disputed</option>
                <option value="void">Void</option>
              </select>
            )}
          </div>
        </CardHeader>
        {bill.notes && (
          <CardContent className="border-t">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notes
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{bill.notes}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Line items</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {lines.length} line{lines.length === 1 ? "" : "s"} — sum ${(linesSum / 100).toFixed(2)}
              {variance !== 0 && (
                <span className="ml-2 text-amber-600">
                  ({variance > 0 ? "+" : ""}${(variance / 100).toFixed(2)} vs. subtotal)
                </span>
              )}
            </p>
          </div>
          {canEdit && !adding && (
            <div className="flex items-center gap-2">
              <ExtractPdfButton
                billId={bill.id}
                defaultPeriod={{
                  start: bill.periodStart,
                  end: bill.periodEnd,
                }}
              />
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus className="mr-1 size-3.5" /> Add Line
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {adding && (
            <LineForm
              billId={bill.id}
              defaultPeriod={{ start: bill.periodStart, end: bill.periodEnd }}
              clients={clients}
              locationsByClient={locationsByClient}
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          )}
          {lines.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground">No line items yet.</p>
          )}
          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Description</th>
                    <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-1.5 text-right font-medium">Unit</th>
                    <th className="px-3 py-1.5 text-right font-medium">Total</th>
                    <th className="px-3 py-1.5 font-medium">Period</th>
                    <th className="px-3 py-1.5 font-medium">Allocated</th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) =>
                    editingLineId === l.id ? (
                      <tr key={l.id}>
                        <td colSpan={7} className="p-3">
                          <LineForm
                            billId={bill.id}
                            line={l}
                            defaultPeriod={{
                              start: bill.periodStart,
                              end: bill.periodEnd,
                            }}
                            clients={clients}
                            locationsByClient={locationsByClient}
                            onDone={() => setEditingLineId(null)}
                            onCancel={() => setEditingLineId(null)}
                          />
                        </td>
                      </tr>
                    ) : allocatingLineId === l.id ? (
                      <tr key={l.id}>
                        <td colSpan={7} className="p-3">
                          <AllocateForm
                            billId={bill.id}
                            line={l}
                            clients={clients}
                            onDone={() => setAllocatingLineId(null)}
                            onCancel={() => setAllocatingLineId(null)}
                          />
                        </td>
                      </tr>
                    ) : (
                      <LineRowView
                        key={l.id}
                        billId={bill.id}
                        line={l}
                        canEdit={canEdit}
                        onEdit={() => setEditingLineId(l.id)}
                        onAllocate={() => setAllocatingLineId(l.id)}
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={pending}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="mr-1 size-3.5" /> Delete this bill
          </Button>
        </div>
      )}
    </div>
  );
}

function LineRowView({
  billId,
  line,
  canEdit,
  onEdit,
  onAllocate,
}: {
  billId: string;
  line: LineRow;
  canEdit: boolean;
  onEdit: () => void;
  onAllocate: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${line.description}"?`)) return;
    start(async () => {
      const r = await deleteBillLine({ lineId: line.id, billId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Line removed");
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{line.description}</div>
        {line.sku && (
          <div className="text-[10px] text-muted-foreground">SKU: {line.sku}</div>
        )}
        {(line.clientName || line.locationLabel) && (
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-primary">
            {line.clientName ?? ""}
            {line.locationLabel ? ` @ ${line.locationLabel}` : ""}
          </div>
        )}
        {!line.clientName && !line.locationLabel && (
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Unassigned
          </div>
        )}
        {line.notes && (
          <div className="text-[10px] text-muted-foreground">{line.notes}</div>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{line.quantity ?? "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {line.unitCostCents != null
          ? `$${(line.unitCostCents / 100).toFixed(2)}`
          : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        ${(line.totalCents / 100).toFixed(2)}
      </td>
      <td className="px-3 py-2 tabular-nums text-[11px] text-muted-foreground">
        {line.periodStart && line.periodEnd
          ? `${line.periodStart} → ${line.periodEnd}`
          : line.periodStart ?? "—"}
      </td>
      <td className="px-3 py-2">
        {line.allocated.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">unallocated</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {line.allocated.map((a, i) => (
              <span key={i} className="text-[10px]">
                {a.clientName}: ${(a.rebillCents / 100).toFixed(2)}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {canEdit && (
          <div className="flex items-center justify-end gap-1">
            <Button variant="outline" size="sm" onClick={onAllocate}>
              Allocate
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function LineForm({
  billId,
  line,
  defaultPeriod,
  clients,
  locationsByClient,
  onDone,
  onCancel,
}: {
  billId: string;
  line?: LineRow;
  defaultPeriod: { start: string | null; end: string | null };
  clients: Client[];
  locationsByClient: Record<string, LocationOpt[]>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [description, setDescription] = useState(line?.description ?? "");
  const [sku, setSku] = useState(line?.sku ?? "");
  const [quantity, setQuantity] = useState(line?.quantity?.toString() ?? "");
  const [clientId, setClientId] = useState(line?.clientId ?? "");
  const [locationId, setLocationId] = useState(line?.locationId ?? "");
  const [unit, setUnit] = useState(
    line?.unitCostCents != null ? (line.unitCostCents / 100).toFixed(2) : "",
  );
  const [total, setTotal] = useState(
    line ? (line.totalCents / 100).toFixed(2) : "",
  );
  const [periodStart, setPeriodStart] = useState(
    line?.periodStart ?? defaultPeriod.start ?? "",
  );
  const [periodEnd, setPeriodEnd] = useState(
    line?.periodEnd ?? defaultPeriod.end ?? "",
  );
  const [notes, setNotes] = useState(line?.notes ?? "");

  const submit = () => {
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    const tot = total ? Math.round(Number(total) * 100) : 0;
    if (Number.isNaN(tot) || tot < 0) {
      toast.error("Total must be a non-negative number");
      return;
    }
    start(async () => {
      const payload = {
        billId,
        description: description.trim(),
        sku: sku.trim() || null,
        quantity: quantity ? parseInt(quantity, 10) : null,
        unitCostCents: unit ? Math.round(Number(unit) * 100) : null,
        totalCents: tot,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
        clientId: clientId || null,
        locationId: locationId || null,
        notes: notes.trim() || null,
      };
      const r = line
        ? await updateBillLine({ ...payload, lineId: line.id })
        : await createBillLine(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(line ? "Line updated" : "Line added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-12">
        <div className="md:col-span-5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Line item description"
          />
        </div>
        <div className="md:col-span-2">
          <Label>SKU</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="md:col-span-1">
          <Label>Qty</Label>
          <Input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Unit (USD)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Total (USD)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Period start</Label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div>
          <Label>Period end</Label>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Client (cost attribution)</Label>
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setLocationId(""); // reset location when client changes
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Unassigned —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Independent of rebilling — this is just where the cost belongs.
            Use Allocate to also create a billable for the client.
          </p>
        </div>
        <div>
          <Label>Location</Label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={!clientId}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-40"
          >
            <option value="">{clientId ? "— Client-wide —" : "Pick a client first"}</option>
            {clientId &&
              (locationsByClient[clientId] ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          <Save className="mr-1 size-3.5" /> {pending ? "Saving…" : line ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function AllocateForm({
  billId,
  line,
  clients,
  onDone,
  onCancel,
}: {
  billId: string;
  line: LineRow;
  clients: Client[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [costBasis, setCostBasis] = useState((line.totalCents / 100).toFixed(2));
  const [markupPct, setMarkupPct] = useState("20");
  const [periodStart, setPeriodStart] = useState(line.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(line.periodEnd ?? "");
  const [description, setDescription] = useState("");

  const submit = () => {
    if (!clientId) {
      toast.error("Choose a client");
      return;
    }
    const cost = Math.round(Number(costBasis) * 100);
    const markup = parseInt(markupPct, 10);
    if (Number.isNaN(cost) || cost < 0) {
      toast.error("Cost basis must be a non-negative number");
      return;
    }
    if (Number.isNaN(markup)) {
      toast.error("Markup must be a number");
      return;
    }
    start(async () => {
      const r = await allocateBillLineToClient({
        lineId: line.id,
        billId,
        clientId,
        costBasisCents: cost,
        markupPct: markup,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
        description: description.trim() || line.description,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Allocated to client (billable created)");
        onDone();
        router.refresh();
      }
    });
  };

  const cost = Number(costBasis) || 0;
  const markup = parseInt(markupPct, 10) || 0;
  const rebill = cost * (1 + markup / 100);

  return (
    <div className="space-y-3 rounded-md border-2 border-dashed border-amber-300 bg-amber-50/30 p-3 dark:border-amber-800 dark:bg-amber-950/10">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
        Allocate "{line.description}" to a client
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Client</Label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Description (optional override)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={line.description}
          />
        </div>
        <div>
          <Label>Cost basis (USD, what USI paid)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={costBasis}
            onChange={(e) => setCostBasis(e.target.value)}
          />
        </div>
        <div>
          <Label>Markup %</Label>
          <Input
            type="number"
            value={markupPct}
            onChange={(e) => setMarkupPct(e.target.value)}
          />
        </div>
        <div>
          <Label>Period start</Label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div>
          <Label>Period end</Label>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
        <span>
          Rebill <code className="font-mono">${cost.toFixed(2)}</code> × ({markup}% markup)
        </span>
        <span className="font-bold tabular-nums">
          = ${rebill.toFixed(2)}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Allocating…" : "Allocate"}
        </Button>
      </div>
    </div>
  );
}

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const map: Record<BillStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    received: { label: "Received", variant: "outline" },
    approved: { label: "Approved", variant: "default" },
    paid: { label: "Paid", variant: "secondary" },
    disputed: { label: "Disputed", variant: "destructive" },
    void: { label: "Void", variant: "outline" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant} className="text-[10px] uppercase">{label}</Badge>;
}
