"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { updateClientContractedSupport } from "@/server/actions/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ContractedSupport = {
  clientId: string;
  supportBaselineCents: number | null;
  supportRateFullComputeCents: number | null;
  supportRateKioskCents: number | null;
  supportRateVmCents: number | null;
  supportRateManagedMobileCents: number | null;
  supportRateAdditionalUserCents: number | null;
  additionalUserCount: number;
  /** Live counts of active hardware in each tier — drive the projected math. */
  fullComputeCount: number;
  kioskCount: number;
  vmCount: number;
  managedMobileCount: number;
};

const dollarsToCents = (s: string): number => {
  if (!s.trim()) return 0;
  const n = Number(s);
  return Number.isNaN(n) ? 0 : Math.round(n * 100);
};
const fmtCents = (n: number | null): string =>
  n != null ? (n / 100).toFixed(2) : "";

export function ContractedSupportCard({ initial }: { initial: ContractedSupport }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [baseline, setBaseline] = useState(fmtCents(initial.supportBaselineCents));
  const [rateFullCompute, setRateFullCompute] = useState(
    fmtCents(initial.supportRateFullComputeCents),
  );
  const [rateKiosk, setRateKiosk] = useState(fmtCents(initial.supportRateKioskCents));
  const [rateVm, setRateVm] = useState(fmtCents(initial.supportRateVmCents));
  const [rateMobile, setRateMobile] = useState(
    fmtCents(initial.supportRateManagedMobileCents),
  );
  const [rateAddUser, setRateAddUser] = useState(
    fmtCents(initial.supportRateAdditionalUserCents),
  );
  const [addUserCount, setAddUserCount] = useState(
    initial.additionalUserCount.toString(),
  );

  const baselineCents = dollarsToCents(baseline);
  const fullComputeRateCents = dollarsToCents(rateFullCompute);
  const kioskRateCents = dollarsToCents(rateKiosk);
  const vmRateCents = dollarsToCents(rateVm);
  const mobileRateCents = dollarsToCents(rateMobile);
  const addUserRateCents = dollarsToCents(rateAddUser);
  const addUserCountNum = parseInt(addUserCount, 10) || 0;

  const projected =
    baselineCents +
    fullComputeRateCents * initial.fullComputeCount +
    kioskRateCents * initial.kioskCount +
    vmRateCents * initial.vmCount +
    mobileRateCents * initial.managedMobileCount +
    addUserRateCents * addUserCountNum;

  const save = () => {
    start(async () => {
      const r = await updateClientContractedSupport({
        clientId: initial.clientId,
        supportBaselineCents: baseline ? baselineCents : null,
        supportRateFullComputeCents: rateFullCompute ? fullComputeRateCents : null,
        supportRateKioskCents: rateKiosk ? kioskRateCents : null,
        supportRateVmCents: rateVm ? vmRateCents : null,
        supportRateManagedMobileCents: rateMobile ? mobileRateCents : null,
        supportRateAdditionalUserCents: rateAddUser ? addUserRateCents : null,
        additionalUserCount: addUserCountNum,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Contracted support updated");
        router.refresh();
      }
    });
  };

  return (
    <Card className="border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Contracted support</CardTitle>
            <CardDescription>
              Per-tier rates × active hardware counts + additional users.
              Drives the monthly statement&apos;s contracted-support section.
            </CardDescription>
          </div>
          <span className="rounded bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-800/40 dark:text-amber-300">
            Finance only
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Monthly baseline (USD)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
            placeholder="Flat monthly support charge"
            className="max-w-xs"
          />
        </div>

        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 text-right font-medium">Active count</th>
                <th className="px-3 py-2 font-medium">Rate (USD)</th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <TierRow
                label="Full Compute Node"
                hint="Workstations / laptops / servers"
                count={initial.fullComputeCount}
                rate={rateFullCompute}
                setRate={setRateFullCompute}
                computedCents={fullComputeRateCents * initial.fullComputeCount}
              />
              <TierRow
                label="Kiosk Node"
                hint="POS / signage / single-purpose stations"
                count={initial.kioskCount}
                rate={rateKiosk}
                setRate={setRateKiosk}
                computedCents={kioskRateCents * initial.kioskCount}
              />
              <TierRow
                label="Virtual Machine Node"
                hint="VMs on a shared host"
                count={initial.vmCount}
                rate={rateVm}
                setRate={setRateVm}
                computedCents={vmRateCents * initial.vmCount}
              />
              <TierRow
                label="Managed Mobile Device"
                hint="Phones / tablets in MDM"
                count={initial.managedMobileCount}
                rate={rateMobile}
                setRate={setRateMobile}
                computedCents={mobileRateCents * initial.managedMobileCount}
              />
              <tr className="border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">Additional Users</div>
                  <div className="text-[10px] text-muted-foreground">
                    Users without hardware (shared mailbox-only, etc.)
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <Input
                    type="number"
                    min="0"
                    value={addUserCount}
                    onChange={(e) => setAddUserCount(e.target.value)}
                    className="ml-auto h-8 w-20 text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rateAddUser}
                    onChange={(e) => setRateAddUser(e.target.value)}
                    className="h-8"
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ${((addUserRateCents * addUserCountNum) / 100).toFixed(2)}
                </td>
              </tr>
            </tbody>
            <tfoot className="border-t bg-muted/30 font-semibold">
              <tr>
                <td className="px-3 py-2 uppercase tracking-wider text-xs">
                  Projected monthly support
                </td>
                <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                  baseline ${(baselineCents / 100).toFixed(2)} + tiers
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ${(projected / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>
            <Save className="mr-1 size-3.5" /> {pending ? "Saving…" : "Save rates"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TierRow({
  label,
  hint,
  count,
  rate,
  setRate,
  computedCents,
}: {
  label: string;
  hint: string;
  count: number;
  rate: string;
  setRate: (s: string) => void;
  computedCents: number;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{count}</td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="h-8"
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        ${(computedCents / 100).toFixed(2)}
      </td>
    </tr>
  );
}
