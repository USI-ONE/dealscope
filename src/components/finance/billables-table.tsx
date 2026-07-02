"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBillable, updateBillable } from "@/server/actions/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BStatus = "draft" | "approved" | "billed" | "paid" | "voided";

export type BillableRow = {
  id: string;
  clientId: string;
  clientName: string;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  costBasisCents: number;
  markupPct: number;
  rebillCents: number;
  status: BStatus;
  invoiceReference: string | null;
};

const STATUS_VARIANT: Record<BStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  approved: "default",
  billed: "secondary",
  paid: "secondary",
  voided: "destructive",
};

export function BillablesTable({ rows, canEdit }: { rows: BillableRow[]; canEdit: boolean }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No billables.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">Client</th>
            <th className="px-3 py-1.5 font-medium">Description</th>
            <th className="px-3 py-1.5 font-medium">Period</th>
            <th className="px-3 py-1.5 text-right font-medium">Cost basis</th>
            <th className="px-3 py-1.5 text-right font-medium">Markup %</th>
            <th className="px-3 py-1.5 text-right font-medium">Rebill</th>
            <th className="px-3 py-1.5 font-medium">Status</th>
            <th className="px-3 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <BillableRowView key={r.id} row={r} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillableRowView({ row, canEdit }: { row: BillableRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [markupPct, setMarkupPct] = useState(row.markupPct.toString());

  const onStatus = (next: BStatus) => {
    start(async () => {
      const r = await updateBillable({ billableId: row.id, status: next });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(`Status → ${next}`);
        router.refresh();
      }
    });
  };

  const saveMarkup = () => {
    const m = parseInt(markupPct, 10);
    if (Number.isNaN(m)) {
      toast.error("Markup must be a number");
      return;
    }
    start(async () => {
      const r = await updateBillable({ billableId: row.id, markupPct: m });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Markup updated");
        setEditing(false);
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!confirm(`Remove this billable for ${row.clientName}?`)) return;
    start(async () => {
      const r = await deleteBillable({ billableId: row.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Billable removed");
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-3 py-2">
        <Link
          href={`/clients/${row.clientId}/billing`}
          className="font-medium hover:underline"
        >
          {row.clientName}
        </Link>
      </td>
      <td className="px-3 py-2">{row.description}</td>
      <td className="px-3 py-2 tabular-nums text-[11px] text-muted-foreground">
        {row.periodStart && row.periodEnd
          ? `${row.periodStart} → ${row.periodEnd}`
          : row.periodStart ?? "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        ${(row.costBasisCents / 100).toFixed(2)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {editing && canEdit ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              value={markupPct}
              onChange={(e) => setMarkupPct(e.target.value)}
              className="h-7 w-16 text-right text-xs"
            />
            <Button size="sm" variant="outline" onClick={saveMarkup} disabled={pending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setEditing(true)}
            className="hover:underline disabled:cursor-default"
          >
            {row.markupPct}%
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        ${(row.rebillCents / 100).toFixed(2)}
      </td>
      <td className="px-3 py-2">
        {canEdit ? (
          <select
            value={row.status}
            onChange={(e) => onStatus(e.target.value as BStatus)}
            disabled={pending}
            className="h-7 rounded-md border border-input bg-background px-2 text-[10px] uppercase"
          >
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="billed">Billed</option>
            <option value="paid">Paid</option>
            <option value="voided">Voided</option>
          </select>
        ) : (
          <Badge variant={STATUS_VARIANT[row.status]} className="text-[10px] uppercase">
            {row.status}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {canEdit && (
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
        )}
      </td>
    </tr>
  );
}
