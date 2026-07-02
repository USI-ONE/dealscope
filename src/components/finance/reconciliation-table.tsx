"use client";

/**
 * Sortable + filterable reconciliation table.
 *
 * Server component computes rows once and hands them here; all
 * sort/filter state is client-side useState (no round-trip). Designed
 * for hundreds of rows — anything larger we'd page server-side.
 *
 * Column header click → sort by that column. Click again to flip
 * direction. Click a third time to clear back to the default sort
 * (positive gaps first, then negative, then zero — surfaces the
 * actionable rows at the top).
 *
 * Filter row above the table:
 *   • Free-text search — matches vendor customer name, product name,
 *     product SKU, TechOS client name
 *   • Connection picker
 *   • TechOS client picker (with an "Unmapped only" pseudo-option)
 *   • Gap-mode picker (all / over-paying / over-billing / balanced)
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VENDOR_CONNECTION_KIND_LABEL } from "@/db/schema";

export type ReconRow = {
  connectionId: string;
  connectionKind: string;
  connectionDisplayName: string;
  vendorClientIdentifier: string;
  vendorClientName: string;
  clientId: string | null;
  clientName: string | null;
  productSku: string;
  productName: string;
  paidSeats: number;
  billedSeats: number | null;
  gap: number | null;
};

type ConnectionOpt = {
  id: string;
  kind: string;
  displayName: string;
};

type ClientOpt = {
  id: string;
  name: string;
};

type SortColumn =
  | "connection"
  | "vendorCustomer"
  | "product"
  | "client"
  | "paid"
  | "billed"
  | "gap";
type SortDirection = "asc" | "desc";
type GapMode = "all" | "positive" | "negative" | "zero";

export function ReconciliationTable({
  rows,
  connections,
  clientOptions,
}: {
  rows: ReconRow[];
  connections: ConnectionOpt[];
  clientOptions: ClientOpt[];
}) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterConnection, setFilterConnection] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterText, setFilterText] = useState<string>("");
  const [gapMode, setGapMode] = useState<GapMode>("all");

  const onHeaderClick = (col: SortColumn) => {
    if (sortColumn !== col) {
      setSortColumn(col);
      // Numbers default to descending (biggest first); text columns asc.
      setSortDirection(
        col === "paid" || col === "billed" || col === "gap" ? "desc" : "asc",
      );
      return;
    }
    if (sortDirection === "desc") {
      setSortDirection("asc");
      return;
    }
    // Third click clears.
    setSortColumn(null);
  };

  const visible = useMemo(() => {
    const needle = filterText.trim().toLowerCase();

    const filtered = rows.filter((r) => {
      if (filterConnection !== "all" && r.connectionId !== filterConnection) {
        return false;
      }
      if (filterClient === "unmapped" && r.clientId !== null) return false;
      if (filterClient !== "all" && filterClient !== "unmapped") {
        if (r.clientId !== filterClient) return false;
      }
      if (gapMode === "positive" && !(r.gap != null && r.gap > 0)) return false;
      if (gapMode === "negative" && !(r.gap != null && r.gap < 0)) return false;
      if (gapMode === "zero" && !(r.gap === 0 || r.gap == null)) return false;
      if (needle) {
        const hay =
          (r.vendorClientName + "\n" +
            r.vendorClientIdentifier + "\n" +
            r.productName + "\n" +
            r.productSku + "\n" +
            (r.clientName ?? "")).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    if (sortColumn === null) {
      // Default: positive gaps first (most actionable), then negative,
      // then balanced — same as the prior server-side ordering.
      return [
        ...filtered.filter((r) => r.gap != null && r.gap > 0).sort((a, b) => b.gap! - a.gap!),
        ...filtered.filter((r) => r.gap != null && r.gap < 0).sort((a, b) => a.gap! - b.gap!),
        ...filtered.filter((r) => r.gap === 0 || r.gap == null),
      ];
    }

    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = colValue(a, sortColumn);
      const bv = colValue(b, sortColumn);
      // Nulls always sort last regardless of direction so they don't
      // crowd the top when ascending numeric.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, filterConnection, filterClient, filterText, gapMode, sortColumn, sortDirection]);

  const anyFilterActive =
    filterConnection !== "all" ||
    filterClient !== "all" ||
    filterText.trim().length > 0 ||
    gapMode !== "all" ||
    sortColumn !== null;

  const clearFilters = () => {
    setFilterConnection("all");
    setFilterClient("all");
    setFilterText("");
    setGapMode("all");
    setSortColumn(null);
  };

  return (
    <>
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3 text-xs">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search vendor customer / product / client / SKU…"
            className="h-8 w-72 pl-7 text-xs"
          />
        </div>

        <select
          value={filterConnection}
          onChange={(e) => setFilterConnection(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All connections</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {VENDOR_CONNECTION_KIND_LABEL[
                c.kind as keyof typeof VENDOR_CONNECTION_KIND_LABEL
              ] ?? c.kind}
              {c.displayName ? ` · ${c.displayName}` : ""}
            </option>
          ))}
        </select>

        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All TechOS clients</option>
          <option value="unmapped">— Unmapped only —</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={gapMode}
          onChange={(e) => setGapMode(e.target.value as GapMode)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">Any gap</option>
          <option value="positive">Over-paying (+gap)</option>
          <option value="negative">Over-billing (−gap)</option>
          <option value="zero">Balanced / no data</option>
        </select>

        <span className="ml-auto text-muted-foreground tabular-nums">
          {visible.length.toLocaleString()} of {rows.length.toLocaleString()} rows
        </span>

        {anyFilterActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 px-2 text-xs"
          >
            <X className="mr-1 size-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <SortableHeader
              label="Connection"
              col="connection"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onClick={onHeaderClick}
            />
            <SortableHeader
              label="Vendor customer"
              col="vendorCustomer"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onClick={onHeaderClick}
            />
            <SortableHeader
              label="Product"
              col="product"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onClick={onHeaderClick}
            />
            <SortableHeader
              label="TechOS client"
              col="client"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onClick={onHeaderClick}
            />
            <SortableHeader
              label="Paid"
              col="paid"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onClick={onHeaderClick}
              align="right"
            />
            <SortableHeader
              label="Billed"
              col="billed"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onClick={onHeaderClick}
              align="right"
            />
            <SortableHeader
              label="Gap"
              col="gap"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onClick={onHeaderClick}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No rows match the current filters.
              </td>
            </tr>
          ) : (
            visible.map((r, i) => (
              <tr
                key={`${r.connectionId}::${r.vendorClientIdentifier}::${r.productSku}::${i}`}
                className="border-b last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2 text-xs">
                  <div className="font-medium">
                    {VENDOR_CONNECTION_KIND_LABEL[
                      r.connectionKind as keyof typeof VENDOR_CONNECTION_KIND_LABEL
                    ] ?? r.connectionKind}
                  </div>
                  <div className="text-muted-foreground">
                    {r.connectionDisplayName}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium">{r.vendorClientName}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.vendorClientIdentifier}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs">
                  <div>{r.productName}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.productSku}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {r.clientId ? (
                    <Link
                      href={`/clients/${r.clientId}`}
                      className="hover:underline"
                    >
                      {r.clientName}
                    </Link>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] uppercase"
                    >
                      <AlertTriangle className="size-2.5" /> unmapped
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {r.paidSeats.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.billedSeats == null ? "—" : r.billedSeats.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {r.gap == null ? (
                    "—"
                  ) : r.gap === 0 ? (
                    <span className="text-muted-foreground">0</span>
                  ) : r.gap > 0 ? (
                    <span className="text-destructive">+{r.gap}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {r.gap}
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

function SortableHeader({
  label,
  col,
  sortColumn,
  sortDirection,
  onClick,
  align = "left",
}: {
  label: string;
  col: SortColumn;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onClick: (col: SortColumn) => void;
  align?: "left" | "right";
}) {
  const active = sortColumn === col;
  const Icon = !active
    ? ArrowUpDown
    : sortDirection === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <th
      className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onClick(col)}
        className={`inline-flex items-center gap-1 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : "hover:text-foreground"}`}
        title={
          active
            ? `Sort ${sortDirection === "asc" ? "descending" : "default (cleared)"}`
            : `Sort by ${label}`
        }
      >
        <span>{label}</span>
        <Icon className={`size-3 ${active ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}

function colValue(r: ReconRow, col: SortColumn): string | number | null {
  switch (col) {
    case "connection":
      return r.connectionDisplayName ?? r.connectionKind;
    case "vendorCustomer":
      return r.vendorClientName;
    case "product":
      return r.productName;
    case "client":
      return r.clientName;
    case "paid":
      return r.paidSeats;
    case "billed":
      return r.billedSeats;
    case "gap":
      return r.gap;
  }
}
