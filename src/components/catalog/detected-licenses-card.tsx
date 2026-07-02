"use client";

/**
 * "Detected from integrations" — shows every vendor_seat_snapshot
 * SKU for one client that isn't yet promoted to a real licenses row.
 * Each row has a one-click "Add to licenses" button.
 *
 * Sits ABOVE the manual ClientLicensesCard on /clients/[id] so the
 * operator sees the integration-sourced inventory first.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plug, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  promoteAllSnapshotsForClient,
  promoteSnapshotToLicense,
} from "@/server/actions/license-promotion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type DetectedLicense = {
  kind: string;
  kindLabel: string;
  productSku: string;
  productName: string;
  seats: number;
  lastSync: string | null;
  /** True when a licenses row with this (client, sku) already exists.
   *  We still render it (for visibility) but disable the promote
   *  button so the operator knows it's been linked. */
  alreadyLinked: boolean;
};

export function DetectedLicensesCard({
  clientId,
  detected,
  canEdit,
}: {
  clientId: string;
  detected: DetectedLicense[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Skip rendering when there are no detections at all — keeps the
  // page tidy for clients with no integration coverage yet.
  if (detected.length === 0) return null;

  const promote = (kind: string, productSku: string, label: string) => {
    start(async () => {
      const r = await promoteSnapshotToLicense({
        clientId,
        kind,
        productSku,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(`Added "${label}" to licenses`);
      router.refresh();
    });
  };

  const promoteAll = () => {
    start(async () => {
      const r = await promoteAllSnapshotsForClient({ clientId });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const d = r?.data;
      if (!d) return;
      const parts: string[] = [];
      if (d.promoted > 0) parts.push(`${d.promoted} added`);
      if (d.skipped > 0) parts.push(`${d.skipped} already linked`);
      if (d.errors.length > 0) parts.push(`${d.errors.length} errors`);
      toast.success(`Done — ${parts.join(", ")}`);
      if (d.errors.length > 0) {
        toast.error(d.errors[0]);
      }
      router.refresh();
    });
  };

  const unlinkedCount = detected.filter((d) => !d.alreadyLinked).length;

  return (
    <Card className="border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/10">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Plug className="mt-1 size-5 text-emerald-700 dark:text-emerald-300" />
            <div>
              <CardTitle className="text-base">
                Detected from integrations
              </CardTitle>
              <CardDescription>
                Live seat counts pulled from Syncro, Liongard, TitanHQ,
                Bitdefender, and Ingram. Promote to a managed license to
                attach cost basis, rebill rate, vendor contact, and notes.
              </CardDescription>
            </div>
          </div>
          {canEdit && unlinkedCount > 0 && (
            <Button
              onClick={promoteAll}
              disabled={pending}
              variant="default"
              size="sm"
              className="shrink-0"
            >
              {pending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 size-3.5" />
              )}
              Add all {unlinkedCount} to licenses
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Integration</th>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 text-right font-medium">Seats</th>
              <th className="px-4 py-2 font-medium">Last sync</th>
              <th className="px-4 py-2 text-right font-medium">{canEdit && "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {detected.map((d) => (
              <tr
                key={`${d.kind}_${d.productSku}`}
                className="border-b last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2">
                  <div className="font-medium">{d.kindLabel}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {d.kind}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium">{d.productName}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {d.productSku}
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {d.seats.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">
                  {d.lastSync ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {d.alreadyLinked ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      <CheckCircle2 className="size-3" />
                      Linked
                    </span>
                  ) : canEdit ? (
                    <Button
                      onClick={() =>
                        promote(d.kind, d.productSku, d.productName)
                      }
                      disabled={pending}
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="mr-1 size-3" />
                      Add
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[10px] text-muted-foreground">
          Counts are the most recent active-seat snapshot per (vendor ×
          SKU). The connector that owns each row writes new snapshots
          nightly; the daily cron updates these values. "Add" creates a
          licenses row pre-populated with vendor, product, seat count,
          and category — you set the commercial terms after.
        </p>
      </CardContent>
    </Card>
  );
}
