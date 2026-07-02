"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileText, Mail, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  markInvoicePaid,
  markInvoiceSent,
  voidInvoice,
} from "@/server/actions/invoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  kind: "monthly_contract" | "hardware" | "one_off";
  status: "draft" | "sent" | "paid" | "void";
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  quantityBasis: string | null;
  flooredUp: boolean;
  itOrderId: string | null;
  sentAt: Date | string | null;
  paidAt: Date | string | null;
};

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const STATUS_VARIANT: Record<
  InvoiceRow["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
  void: "destructive",
};

const KIND_LABEL: Record<InvoiceRow["kind"], string> = {
  monthly_contract: "Monthly",
  hardware: "Hardware",
  one_off: "One-off",
};

export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceRow["status"]>(
    "all",
  );
  const [kindFilter, setKindFilter] = useState<"all" | InvoiceRow["kind"]>(
    "all",
  );
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.periodStart) set.add(r.periodStart.slice(0, 7));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (monthFilter !== "all") {
        const m = r.periodStart?.slice(0, 7);
        if (m !== monthFilter) return false;
      }
      if (!q) return true;
      return (
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter, kindFilter, monthFilter]);

  const send = (invoiceId: string) => {
    start(async () => {
      const r = await markInvoiceSent({ invoiceId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Marked sent");
        router.refresh();
      }
    });
  };
  const pay = (invoiceId: string) => {
    start(async () => {
      const r = await markInvoicePaid({ invoiceId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Marked paid");
        router.refresh();
      }
    });
  };
  const voidIt = (invoiceId: string) => {
    const reason = prompt("Void reason (required):");
    if (!reason || !reason.trim()) return;
    start(async () => {
      const r = await voidInvoice({ invoiceId, reason: reason.trim() });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Invoice voided");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number / client…"
            className="h-9 w-64 pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All kinds</option>
          <option value="monthly_contract">Monthly contract</option>
          <option value="hardware">Hardware</option>
          <option value="one_off">One-off</option>
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice #</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">Issued</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  No invoices match. Run the monthly batch to create some.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b last:border-0 align-top ${r.status === "void" ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/finance/invoices/${r.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {r.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${r.clientId}`}
                      className="hover:underline"
                    >
                      {r.clientName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {KIND_LABEL[r.kind]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
                    {r.periodStart && r.periodEnd
                      ? `${r.periodStart} → ${r.periodEnd}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-[11px] tabular-nums">
                    {r.issueDate}
                  </td>
                  <td className="px-3 py-2 text-[11px] tabular-nums">
                    {r.dueDate}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtUsd(r.totalCents)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={STATUS_VARIANT[r.status]}
                      className="text-[10px] uppercase"
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "draft" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => send(r.id)}
                        disabled={pending}
                        title="Mark sent"
                      >
                        <Mail className="mr-1 size-3.5" /> Send
                      </Button>
                    )}
                    {r.status === "sent" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => pay(r.id)}
                        disabled={pending}
                        title="Mark paid"
                      >
                        <CheckCircle2 className="mr-1 size-3.5" /> Paid
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      title="Download .docx invoice"
                    >
                      <a
                        href={`/finance/invoices/${r.id}/export.docx`}
                        target="_blank"
                        rel="noopener"
                      >
                        <FileText className="size-3.5" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      title="Download QuickBooks .iif"
                    >
                      <a
                        href={`/finance/invoices/${r.id}/export.iif`}
                        target="_blank"
                        rel="noopener"
                      >
                        <Download className="size-3.5" />
                      </a>
                    </Button>
                    {r.status !== "paid" && r.status !== "void" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => voidIt(r.id)}
                        disabled={pending}
                        title="Void this invoice"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <XCircle className="size-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
