"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createVendorBill } from "@/server/actions/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Vendor = { id: string; name: string };

const PILL_GRADIENT = "linear-gradient(135deg, #458C5E 0%, #3B697A 100%)";

export function CreateBillDialog({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setInvoiceNumber("");
    setPeriodStart("");
    setPeriodEnd("");
    setReceivedAt("");
    setDueAt("");
    setSubtotal("");
    setTax("");
    setTotal("");
    setNotes("");
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1" /> New Bill
      </Button>
    );

  const submit = () => {
    if (!vendorId) {
      toast.error("Select a vendor first");
      return;
    }
    const sub = subtotal ? Math.round(Number(subtotal) * 100) : 0;
    const tx = tax ? Math.round(Number(tax) * 100) : 0;
    const tot = total ? Math.round(Number(total) * 100) : sub + tx;
    if (
      [sub, tx, tot].some((n) => Number.isNaN(n)) ||
      [sub, tx, tot].some((n) => n < 0)
    ) {
      toast.error("Amounts must be non-negative numbers");
      return;
    }
    start(async () => {
      const r = await createVendorBill({
        vendorId,
        invoiceNumber: invoiceNumber.trim() || null,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
        receivedAt: receivedAt || null,
        dueAt: dueAt || null,
        subtotalCents: sub,
        taxCents: tx,
        totalCents: tot,
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data?.bill) {
        toast.success("Bill created — add line items next");
        reset();
        setOpen(false);
        router.push(`/finance/bills/${r.data.bill.id}`);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-3 rounded-xl border bg-background shadow-2xl">
        <div
          className="flex items-center justify-between rounded-t-xl px-5 py-3 text-white"
          style={{ background: PILL_GRADIENT }}
        >
          <h2 className="text-base font-bold uppercase tracking-wider">New Vendor Bill</h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-5">
          <Section label="Vendor & Invoice">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Vendor</Label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Invoice number</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-12345"
                />
              </div>
              <div>
                <Label>Received</Label>
                <Input
                  type="date"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
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
              <div>
                <Label>Due</Label>
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            </div>
          </Section>

          <Section label="Amounts (USD)">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Subtotal</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                />
              </div>
              <div>
                <Label>Tax</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>
              <div>
                <Label>Total</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="auto = sub + tax"
                />
              </div>
            </div>
          </Section>

          <Section label="Notes" lastInColumn>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything finance needs to remember when reconciling."
            />
          </Section>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create Bill"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
  lastInColumn,
}: {
  label: string;
  children: React.ReactNode;
  lastInColumn?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", !lastInColumn && "")}>
      <div className="grid grid-cols-[140px_1fr]">
        <div
          className="flex items-center justify-center px-3 py-3 text-center text-xs font-bold uppercase tracking-widest text-white"
          style={{ background: PILL_GRADIENT }}
        >
          {label}
        </div>
        <div className="border-l p-4">{children}</div>
      </div>
    </div>
  );
}
