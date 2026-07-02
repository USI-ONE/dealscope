"use client";

/**
 * Snapshot table for one integration.
 *
 * Lists the latest seat snapshot per (vendor_client, product). For
 * each row we either:
 *   - show the linked TechOS client (read-only), or
 *   - show a "Map to client" dropdown the operator picks from.
 *
 * Submitting a mapping creates the vendor_client_mappings row; the
 * next sync will then attribute those snapshots to the chosen client.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  linkVendorClient,
  unlinkVendorClient,
} from "@/server/actions/integrations";
import { Button } from "@/components/ui/button";

export type SnapshotRow = {
  vendorClientIdentifier: string;
  vendorClientName: string;
  clientId: string | null;
  clientName: string | null;
  productSku: string;
  productName: string;
  seats: number;
  costPerSeatCents: number | null;
  capturedAt: Date | string;
  mappingId: string | null;
};

type ClientOpt = { id: string; name: string };

export function IntegrationSnapshotsTable({
  connectionId,
  rows,
  clients,
}: {
  connectionId: string;
  rows: SnapshotRow[];
  clients: ClientOpt[];
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No snapshots yet. Click <strong>Sync now</strong> after saving
        credentials and we'll pull the latest seat counts from this vendor.
      </div>
    );
  }

  // Group by vendor_client_identifier so the mapping picker only appears
  // once per customer (mapping is per-customer, not per-product).
  const byCustomer = new Map<
    string,
    { name: string; mappingId: string | null; clientId: string | null; rows: SnapshotRow[] }
  >();
  for (const r of rows) {
    const g = byCustomer.get(r.vendorClientIdentifier);
    if (g) g.rows.push(r);
    else
      byCustomer.set(r.vendorClientIdentifier, {
        name: r.vendorClientName,
        mappingId: r.mappingId,
        clientId: r.clientId,
        rows: [r],
      });
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-4 py-2 font-medium">Vendor customer</th>
          <th className="px-4 py-2 font-medium">Product</th>
          <th className="px-4 py-2 text-right font-medium">Seats</th>
          <th className="px-4 py-2 font-medium">TechOS client</th>
          <th className="px-4 py-2 font-medium">Captured</th>
          <th className="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {Array.from(byCustomer.entries()).map(([identifier, group]) => (
          <CustomerRows
            key={identifier}
            identifier={identifier}
            group={group}
            connectionId={connectionId}
            clients={clients}
          />
        ))}
      </tbody>
    </table>
  );
}

function CustomerRows({
  identifier,
  group,
  connectionId,
  clients,
}: {
  identifier: string;
  group: {
    name: string;
    mappingId: string | null;
    clientId: string | null;
    rows: SnapshotRow[];
  };
  connectionId: string;
  clients: ClientOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const link = (clientId: string) => {
    if (!clientId) return;
    start(async () => {
      const r = await linkVendorClient({
        connectionId,
        vendorClientIdentifier: identifier,
        vendorClientName: group.name,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Linked");
        router.refresh();
      }
    });
  };

  const unlink = () => {
    if (!group.mappingId) return;
    start(async () => {
      const r = await unlinkVendorClient({ mappingId: group.mappingId! });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Unlinked");
        router.refresh();
      }
    });
  };

  return (
    <>
      {group.rows.map((r, i) => (
        <tr
          key={`${identifier}::${r.productSku}`}
          className="border-b last:border-0 align-top hover:bg-muted/30"
        >
          <td className="px-4 py-2.5">
            {i === 0 ? (
              <>
                <div className="font-medium">{group.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {identifier}
                </div>
              </>
            ) : null}
          </td>
          <td className="px-4 py-2.5">
            {r.productName}
            <div className="text-[10px] text-muted-foreground">
              {r.productSku}
            </div>
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums font-medium">
            {r.seats.toLocaleString()}
          </td>
          <td className="px-4 py-2.5">
            {i === 0 ? (
              group.clientId && r.clientName ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.clientName}</span>
                  {group.mappingId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={unlink}
                      disabled={pending}
                      aria-label="Unlink"
                      className="size-6 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Link2 className="size-3 text-muted-foreground" />
                  <select
                    disabled={pending}
                    onChange={(e) => link(e.target.value)}
                    defaultValue=""
                    className="h-8 max-w-[16rem] rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">— map to client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )
            ) : null}
          </td>
          <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
            {new Date(r.capturedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </td>
          <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground">
            {r.costPerSeatCents != null && (
              <span>${(r.costPerSeatCents / 100).toFixed(2)}/seat</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
