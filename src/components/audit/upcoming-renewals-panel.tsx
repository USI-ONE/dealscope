/**
 * Read-only panel listing every license / subscription / domain whose
 * renewal falls in the next 30 days. Drives the rock's "30-day renewal
 * notice" KPI.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AuditItem } from "@/lib/audit/inventory";

const KIND_LABEL: Record<AuditItem["kind"], string> = {
  license: "License",
  subscription: "Subscription",
  domain: "Domain",
};

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const ms = new Date(`${d}T00:00:00Z`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function UpcomingRenewalsPanel({ items }: { items: AuditItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing renewing in the next 30 days. Populate renewal dates on
        the items below as part of the audit.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">Renews</th>
            <th className="px-3 py-1.5 font-medium">In</th>
            <th className="px-3 py-1.5 font-medium">Item</th>
            <th className="px-3 py-1.5 font-medium">Client</th>
            <th className="px-3 py-1.5 font-medium">Vendor</th>
            <th className="px-3 py-1.5 font-medium">Auto-renew</th>
            <th className="px-3 py-1.5 font-medium">Billable</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const days = daysUntil(i.renewalDate);
            const urgent = (days ?? 0) <= 7;
            return (
              <tr key={`${i.kind}-${i.id}`} className="border-b last:border-0 align-top">
                <td className="px-3 py-2 tabular-nums">{i.renewalDate}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant={urgent ? "destructive" : "secondary"}
                    className="text-[10px] uppercase"
                  >
                    {days === null
                      ? "—"
                      : days <= 0
                        ? "due / overdue"
                        : `${days}d`}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{i.name}</div>
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {KIND_LABEL[i.kind]}
                    </Badge>
                    {i.detail && <span>{i.detail}</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {i.clientId && i.clientName ? (
                    <Link
                      href={`/clients/${i.clientId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {i.clientName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">{i.vendorName ?? "—"}</td>
                <td className="px-3 py-2">
                  {i.autoRenew == null ? "—" : i.autoRenew ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2">
                  {i.billable ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Billable
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
