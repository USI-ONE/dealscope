"use client";

/**
 * Per-client third-party rebill rates card.
 *
 * Sits alongside ContractedSupportCard on the client detail tab and
 * captures what we charge each client per seat for the third-party
 * licenses that flow through the PS monthly invoice — Bitdefender,
 * Liongard, TitanHQ, and Syncro Remote Access.
 *
 * Each row shows:
 *   • Vendor logo / label + short hint
 *   • Latest active-seat count from vendor_seat_snapshots
 *   • The contracted rate input
 *   • Computed monthly amount (count × rate)
 *
 * Rates persist into clients.rebill_rate_<product>_cents. NULL = "use
 * the template default" (shown as a placeholder). An explicit value
 * (incl. 0) overrides.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { updateClientRebillRates } from "@/server/actions/finance";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type ProductRebillRatesInitial = {
  clientId: string;
  rebillRateBitdefenderCents: number | null;
  rebillRateLiongardCents: number | null;
  rebillRateTitanhqCents: number | null;
  rebillRateSyncroRemoteCents: number | null;
  /** Latest active-seat counts from vendor_seat_snapshots, for the
   *  projected-monthly math. Operator can leave these informational. */
  bitdefenderSeats: number;
  liongardSeats: number;
  titanhqSeats: number;
  syncroRemoteContacts: number;
};

/** Template defaults (kept in sync with PS_PRODUCT_TEMPLATES). */
const DEFAULTS = {
  bitdefender: 1000, // $10.00
  liongard: 300, //    $3.00
  titanhq: 350, //     $3.50
  syncroRemote: 600, // $6.00
} as const;

const dollarsToCents = (s: string): number => {
  if (!s.trim()) return 0;
  const n = Number(s);
  return Number.isNaN(n) ? 0 : Math.round(n * 100);
};
const fmtCents = (n: number | null): string =>
  n != null ? (n / 100).toFixed(2) : "";

export function ProductRebillRatesCard({
  initial,
}: {
  initial: ProductRebillRatesInitial;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [bd, setBd] = useState(fmtCents(initial.rebillRateBitdefenderCents));
  const [lg, setLg] = useState(fmtCents(initial.rebillRateLiongardCents));
  const [th, setTh] = useState(fmtCents(initial.rebillRateTitanhqCents));
  const [sr, setSr] = useState(fmtCents(initial.rebillRateSyncroRemoteCents));

  // For the projected math we use the live edit value if the user has
  // typed something, otherwise the template default — same behavior the
  // PS generator uses when computing the actual invoice.
  const effective = {
    bd: bd ? dollarsToCents(bd) : DEFAULTS.bitdefender,
    lg: lg ? dollarsToCents(lg) : DEFAULTS.liongard,
    th: th ? dollarsToCents(th) : DEFAULTS.titanhq,
    sr: sr ? dollarsToCents(sr) : DEFAULTS.syncroRemote,
  };

  const projected =
    effective.bd * initial.bitdefenderSeats +
    effective.lg * initial.liongardSeats +
    effective.th * initial.titanhqSeats +
    effective.sr * initial.syncroRemoteContacts;

  const save = () => {
    start(async () => {
      const r = await updateClientRebillRates({
        clientId: initial.clientId,
        rebillRateBitdefenderCents: bd ? dollarsToCents(bd) : null,
        rebillRateLiongardCents: lg ? dollarsToCents(lg) : null,
        rebillRateTitanhqCents: th ? dollarsToCents(th) : null,
        rebillRateSyncroRemoteCents: sr ? dollarsToCents(sr) : null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Rebill rates updated");
        router.refresh();
      }
    });
  };

  return (
    <Card className="border-blue-300 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              Third-party rebill rates
            </CardTitle>
            <CardDescription>
              Per-seat prices for Bitdefender / Liongard / TitanHQ /
              Syncro Remote on the PS monthly invoice. Blank field =
              use template default.
            </CardDescription>
          </div>
          <span className="rounded bg-blue-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-900 dark:bg-blue-800/40 dark:text-blue-300">
            Finance only
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">
                  Active seats
                </th>
                <th className="px-3 py-2 font-medium">
                  Per-seat rate (USD)
                </th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <RebillRow
                label="Bitdefender GravityZone"
                hint="Secure Plus Bundle — per endpoint"
                seats={initial.bitdefenderSeats}
                rate={bd}
                setRate={setBd}
                fallbackDefault={DEFAULTS.bitdefender}
                computedCents={effective.bd * initial.bitdefenderSeats}
              />
              <RebillRow
                label="Liongard"
                hint="Asset inventory — per agent"
                seats={initial.liongardSeats}
                rate={lg}
                setRate={setLg}
                fallbackDefault={DEFAULTS.liongard}
                computedCents={effective.lg * initial.liongardSeats}
              />
              <RebillRow
                label="TitanHQ Plus"
                hint="Phish + Spam + SAT — per mailbox"
                seats={initial.titanhqSeats}
                rate={th}
                setRate={setTh}
                fallbackDefault={DEFAULTS.titanhq}
                computedCents={effective.th * initial.titanhqSeats}
              />
              <RebillRow
                label="Syncro Remote Access"
                hint="Splashtop session control — per contact"
                seats={initial.syncroRemoteContacts}
                rate={sr}
                setRate={setSr}
                fallbackDefault={DEFAULTS.syncroRemote}
                computedCents={effective.sr * initial.syncroRemoteContacts}
              />
            </tbody>
            <tfoot className="border-t bg-muted/30 font-semibold">
              <tr>
                <td
                  className="px-3 py-2 uppercase tracking-wider text-xs"
                  colSpan={3}
                >
                  Projected monthly third-party rebill
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  $
                  {(projected / 100).toLocaleString(undefined, {
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
            <Save className="mr-1 size-3.5" />{" "}
            {pending ? "Saving…" : "Save rates"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RebillRow({
  label,
  hint,
  seats,
  rate,
  setRate,
  fallbackDefault,
  computedCents,
}: {
  label: string;
  hint: string;
  seats: number;
  rate: string;
  setRate: (s: string) => void;
  fallbackDefault: number;
  computedCents: number;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{seats}</td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={`default ${(fallbackDefault / 100).toFixed(2)}`}
          className="h-8"
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        ${(computedCents / 100).toFixed(2)}
      </td>
    </tr>
  );
}
