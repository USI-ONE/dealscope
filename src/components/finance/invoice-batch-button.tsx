"use client";

/**
 * One-click "Run monthly batch" button + outcomes panel.
 *
 * Defaults the month to the prior calendar month (typical 1st-of-month
 * workflow). Calls runMonthlyInvoiceBatch, shows per-client outcomes
 * inline so the user sees exactly which clients got an invoice and
 * which were skipped.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { runMonthlyInvoiceBatch } from "@/server/actions/invoices";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Outcome = {
  clientId: string;
  clientName: string;
  status:
    | "created"
    | "already_exists"
    | "no_lines"
    | "client_archived"
    | "error";
  invoiceId?: string;
  invoiceNumber?: string;
  totalCents?: number;
  message?: string;
};

function monthOptions(): string[] {
  const opts: string[] = [];
  const now = new Date();
  for (let i = -1; i <= 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    opts.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return opts;
}

const fmtUsd = (cents?: number) =>
  cents == null
    ? "—"
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

export function InvoiceBatchButton({
  defaultMonth,
}: {
  defaultMonth: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(defaultMonth);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const opts = monthOptions();

  const run = () => {
    start(async () => {
      const r = await runMonthlyInvoiceBatch({ month });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (data) {
        setOutcomes(data.outcomes);
        toast.success(
          `Created ${data.summary.created} · existing ${data.summary.already_exists} · skipped ${data.summary.no_lines} · errors ${data.summary.error}`,
        );
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Billing month
        </label>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          disabled={pending}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {opts.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button onClick={run} disabled={pending}>
          <Play className="mr-1 size-3.5" />
          {pending ? "Generating…" : "Run monthly batch"}
        </Button>
      </div>

      {outcomes && (
        <Card className="w-[28rem] max-w-full border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2 max-sm:flex-wrap">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Batch complete · {month}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOutcomes(null)}
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto rounded border bg-background">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Client</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.clientId} className="border-b last:border-0">
                      <td className="px-3 py-1.5">{o.clientName}</td>
                      <td
                        className={`px-3 py-1.5 capitalize ${
                          o.status === "error"
                            ? "text-rose-600"
                            : o.status === "created"
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                        }`}
                        title={o.message ?? undefined}
                      >
                        {o.status.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {fmtUsd(o.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
