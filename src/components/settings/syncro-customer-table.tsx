"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Cable, Check, Plus, RefreshCw, Unlink } from "lucide-react";
import {
  compareSyncroCustomers,
  createClientFromSyncro,
  linkClientToSyncro,
  syncAssetsForClient,
  unlinkClientFromSyncro,
  type SyncroCustomerCompareRow,
} from "@/server/actions/syncro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ClientOpt = { id: string; name: string };

export function SyncroCustomerTable({
  initialRows,
  clients,
}: {
  initialRows: SyncroCustomerCompareRow[];
  clients: ClientOpt[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [pending, start] = useTransition();
  const router = useRouter();

  const refresh = () => {
    start(async () => {
      const r = await compareSyncroCustomers({});
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data?.rows) {
        setRows(r.data.rows);
        toast.success(`Refreshed — ${r.data.rows.length} Syncro customers`);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} customer{rows.length === 1 ? "" : "s"} in Syncro —{" "}
          {rows.filter((r) => r.matchedClientId).length} linked,{" "}
          {rows.filter((r) => !r.matchedClientId).length} unlinked.
        </p>
        <Button variant="outline" size="sm" onClick={refresh} disabled={pending}>
          <RefreshCw className="mr-1 size-3.5" /> Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Syncro customer</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Linked TechOS client</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row
                key={r.syncroId}
                row={r}
                clients={clients}
                onMutate={refresh}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  row,
  clients,
  onMutate,
}: {
  row: SyncroCustomerCompareRow;
  clients: ClientOpt[];
  onMutate: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [linkClientId, setLinkClientId] = useState("");

  const create = () => {
    start(async () => {
      const r = await createClientFromSyncro({ syncroCustomerId: row.syncroId });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data?.client) {
        toast.success(`Created TechOS client: ${r.data.client.name}`);
        onMutate();
        router.refresh();
      }
    });
  };

  const link = () => {
    if (!linkClientId) return;
    start(async () => {
      const r = await linkClientToSyncro({
        clientId: linkClientId,
        syncroCustomerId: row.syncroId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Linked");
        onMutate();
        router.refresh();
      }
    });
  };

  const unlink = () => {
    if (!row.matchedClientId) return;
    if (!confirm(`Unlink "${row.matchedClientName}" from Syncro?`)) return;
    start(async () => {
      const r = await unlinkClientFromSyncro({ clientId: row.matchedClientId! });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Unlinked");
        onMutate();
        router.refresh();
      }
    });
  };

  const syncAssets = () => {
    if (!row.matchedClientId) return;
    start(async () => {
      const r = await syncAssetsForClient({ clientId: row.matchedClientId! });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data?.summary) {
        const s = r.data.summary;
        toast.success(
          `Pulled ${s.pulled} · created ${s.created} · updated ${s.updated}${s.errors.length ? ` · ${s.errors.length} errors` : ""}`,
        );
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-3 py-2">
        <div className="font-medium">{row.displayName}</div>
        <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
          <code className="font-mono">#{row.syncroId}</code>
          {(row.city || row.state) && (
            <span>
              {[row.city, row.state].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{row.email ?? "—"}</td>
      <td className="px-3 py-2">
        {row.matchedClientId ? (
          <Link
            href={`/clients/${row.matchedClientId}`}
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            <Check className="size-3.5 text-primary" />
            {row.matchedClientName}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {row.matchedClientId ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={syncAssets}
              disabled={pending}
            >
              <Cable className="mr-1 size-3.5" /> Pull assets
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={unlink}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Unlink className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={create}
              disabled={pending}
            >
              <Plus className="mr-1 size-3.5" /> Create new
            </Button>
            {clients.length > 0 && (
              <>
                <select
                  value={linkClientId}
                  onChange={(e) => setLinkClientId(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  disabled={pending}
                >
                  <option value="">Link to existing…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={link}
                  disabled={pending || !linkClientId}
                >
                  Link
                </Button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
