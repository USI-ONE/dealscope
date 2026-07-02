"use client";

/**
 * Interactive readiness matrix for the monthly-invoice batch page.
 *
 *   • Month picker at the top — changing it reloads the page.
 *   • Table of all active clients, grouped: Ready → Blocked → Already
 *     invoiced → Not contracted.
 *   • Ready clients are pre-selected via a checkbox; operator can
 *     deselect any they want to skip this run.
 *   • "Generate N invoices" button kicks the batch action.
 *   • Blocked clients show exactly what's missing (rate columns) + the
 *     integration-seat count so the operator sees the financial impact.
 *   • Existing invoices link straight through; blocked clients link to
 *     the per-client setup page where rates can be edited.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { generateMonthlyBatch } from "@/server/actions/invoice-batch";
import type { BatchPreflightSummary } from "@/lib/invoices/batch-preflight";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const PRODUCT_LABEL: Record<string, string> = {
  compute_node: "Compute",
  bitdefender_secure_plus: "BD",
  liongard: "Liongard",
  titanhq_plus: "TitanHQ",
  syncro_remote: "Syncro Remote",
};

function formatCents(c: number): string {
  return `$${(c / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function BatchPreflightTable({
  preflight,
}: {
  preflight: BatchPreflightSummary;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(preflight.yyyymm);

  // Pre-select all READY clients on first render.
  const initialSelection = useMemo(
    () =>
      new Set(
        preflight.rows
          .filter((r) => r.status === "ready")
          .map((r) => r.clientId),
      ),
    [preflight.rows],
  );
  const [selected, setSelected] = useState<Set<string>>(initialSelection);

  const toggle = (id: string, on: boolean) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const selectAllReady = () => {
    setSelected(
      new Set(
        preflight.rows
          .filter((r) => r.status === "ready")
          .map((r) => r.clientId),
      ),
    );
  };
  const clearAll = () => setSelected(new Set());

  const selectedTotal = useMemo(() => {
    let cents = 0;
    for (const r of preflight.rows) {
      if (selected.has(r.clientId)) cents += r.projectedAmountCents;
    }
    return cents;
  }, [selected, preflight.rows]);

  const ready = preflight.rows.filter((r) => r.status === "ready");
  const blocked = preflight.rows.filter((r) => r.status === "missing_rates");
  const alreadyInvoiced = preflight.rows.filter(
    (r) => r.status === "already_invoiced",
  );
  const notContracted = preflight.rows.filter(
    (r) => r.status === "no_compute_nodes",
  );

  const onGenerate = () => {
    if (selected.size === 0) {
      toast.error("Select at least one client first");
      return;
    }
    start(async () => {
      const r = await generateMonthlyBatch({
        yyyymm: preflight.yyyymm,
        clientIds: [...selected],
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (!data) {
        toast.error("Batch failed — no data returned");
        return;
      }
      const msg = `${data.created} created · ${data.skipped} skipped${data.errored > 0 ? ` · ${data.errored} errored` : ""}`;
      if (data.errored > 0) toast.warning(msg);
      else toast.success(`${msg} · ${formatCents(data.totalDollarsCreated)}`);
      router.push(`/finance/invoices?period=${preflight.yyyymm}`);
    });
  };

  const changeMonth = (next: string) => {
    if (!/^\d{4}-\d{2}$/.test(next)) return;
    setMonth(next);
    router.push(`/finance/invoices/batch?month=${next}`);
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Month picker + action bar */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-3">
            <div>
              <Label htmlFor="month" className="text-xs uppercase tracking-wider text-muted-foreground">
                Billing month
              </Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => changeMonth(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="pb-1 text-sm text-muted-foreground">
              {monthLabel(preflight.yyyymm)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAllReady}>
              Select all ready
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
            <Button onClick={onGenerate} disabled={pending || selected.size === 0}>
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              Generate {selected.size} invoice{selected.size === 1 ? "" : "s"}
              {selectedTotal > 0 ? ` · ${formatCents(selectedTotal)}` : ""}
            </Button>
          </div>
        </div>

        {/* READY */}
        {ready.length > 0 && (
          <Section title="Ready to invoice" tone="emerald" count={ready.length}>
            <Table>
              <thead>
                <tr>
                  <Th className="w-8"></Th>
                  <Th>Client</Th>
                  <Th className="text-right">Compute</Th>
                  <Th className="text-right">Projected</Th>
                  <Th className="text-right">Detail</Th>
                </tr>
              </thead>
              <tbody>
                {ready.map((r) => (
                  <tr key={r.clientId} className="border-b last:border-b-0">
                    <Td>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-primary"
                        checked={selected.has(r.clientId)}
                        onChange={(e) => toggle(r.clientId, e.target.checked)}
                      />
                    </Td>
                    <Td className="font-medium">{r.clientName}</Td>
                    <Td className="text-right tabular-nums">{r.computeNodes}</Td>
                    <Td className="text-right font-medium tabular-nums">
                      {formatCents(r.projectedAmountCents)}
                    </Td>
                    <Td className="text-right">
                      <Link
                        href={`/finance/invoices/new?client=${r.clientId}&month=${preflight.yyyymm}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Per-client
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        )}

        {/* BLOCKED */}
        {blocked.length > 0 && (
          <Section title="Blocked — missing rates" tone="amber" count={blocked.length}>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Missing rates</Th>
                  <Th className="text-right">Integration seats</Th>
                  <Th className="text-right">Would-be total</Th>
                  <Th className="text-right">Fix</Th>
                </tr>
              </thead>
              <tbody>
                {blocked.map((r) => (
                  <tr key={r.clientId} className="border-b last:border-b-0">
                    <Td className="font-medium">{r.clientName}</Td>
                    <Td className="space-x-1">
                      {r.missingRates.map((k) => (
                        <Badge key={k} variant="outline" className="border-amber-500/40 text-amber-700">
                          {PRODUCT_LABEL[k] ?? k}
                        </Badge>
                      ))}
                    </Td>
                    <Td className="text-right text-xs tabular-nums text-muted-foreground">
                      {Object.entries(r.integrationSeats)
                        .filter(([, v]) => v != null && v > 0)
                        .map(([k, v]) => `${PRODUCT_LABEL[k] ?? k}:${v}`)
                        .join(" · ") || "—"}
                    </Td>
                    <Td className="text-right tabular-nums text-muted-foreground">
                      {r.projectedAmountCents > 0
                        ? formatCents(r.projectedAmountCents)
                        : "—"}
                    </Td>
                    <Td className="text-right">
                      <Link
                        href={`/clients/${r.clientId}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Open client
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        )}

        {/* ALREADY INVOICED */}
        {alreadyInvoiced.length > 0 && (
          <Section
            title="Already invoiced this month"
            tone="muted"
            count={alreadyInvoiced.length}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th className="text-right">Invoice</Th>
                </tr>
              </thead>
              <tbody>
                {alreadyInvoiced.map((r) => (
                  <tr key={r.clientId} className="border-b last:border-b-0">
                    <Td className="font-medium">{r.clientName}</Td>
                    <Td className="text-right">
                      {r.existingInvoiceId ? (
                        <Link
                          href={`/finance/invoices/${r.existingInvoiceId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Open invoice
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        )}

        {/* NOT CONTRACTED */}
        {notContracted.length > 0 && (
          <Section
            title="Not on monthly contract"
            tone="muted"
            count={notContracted.length}
          >
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {notContracted.map((r) => r.clientName).join(" · ")}
            </div>
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "emerald" | "amber" | "muted";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/10"
      : tone === "amber"
        ? "border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10"
        : "border-muted bg-muted/20";
  return (
    <div className={`rounded-md border ${toneCls}`}>
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full text-sm">{children}</table>;
}
function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border-b px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}
