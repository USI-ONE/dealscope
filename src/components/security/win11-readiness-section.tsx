/**
 * Win11 Hardware Readiness — mirrors the second sheet of the PS
 * Client Security Posture Checklist xlsx.
 *
 * Reads active hardware rows + the windows11_readiness flag we
 * already capture from Syncro/Intune enrichment, computes failing
 * requirement (RAM / TPM / CPU gen), and recommends an action by
 * combining warranty-ends-at and purchase-date with the eligibility
 * verdict.
 *
 * Server-rendered (no editing required for the auto view). Future
 * iteration: let operator override the per-device action in a sibling
 * client table; persist into a new column or a separate refresh-plan
 * table.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Device = {
  id: string;
  label: string | null;
  assignedTo: string | null;
  manufacturer: string | null;
  model: string | null;
  cpuLabel: string | null;
  ramGb: number | null;
  diskGb: number | null;
  win11: string | null;
  osName: string | null;
  osVersion: string | null;
  warrantyEndsAt: string | null;
  purchasedAt: string | null;
};

export function Win11ReadinessSection({
  clientName,
  devices,
}: {
  clientName: string;
  devices: Device[];
}) {
  // Filter to laptops/workstations — the Win11 conversation isn't
  // about servers, kiosks, tablets, etc.
  const targets = devices.filter((d) => {
    // We don't have kind here, so use OS as a proxy. Anything Windows
    // is in scope.
    const os = (d.osName ?? "").toLowerCase();
    return os.includes("win") || d.win11 != null;
  });

  // Syncro intel writes:
  //   "Ready" / null / "Failed: TPM Check, Storage Check..."
  const isReady = (s: string | null) =>
    (s ?? "").trim().toLowerCase() === "ready";
  const isFailed = (s: string | null) => /^failed/i.test((s ?? "").trim());
  const isUpgradable = (s: string | null) =>
    isFailed(s) &&
    /^failed[:\s]+(\s*(storage check[^,]*|ram check)\s*,?)+\s*$/i.test(
      (s ?? "").trim(),
    );

  const totalReviewed = targets.length;
  const notEligible = targets.filter(
    (d) => isFailed(d.win11) && !isUpgradable(d.win11),
  );
  const partial = targets.filter((d) => isUpgradable(d.win11));
  const eligible = targets.filter((d) => isReady(d.win11));

  // Year-bucket the refresh recommendations. Logic:
  //   • Win11 not_compatible AND warranty already expired or hardware
  //     ≥ 5 yr old → Replace FY26 (urgent)
  //   • Win11 not_compatible AND newer hardware → Replace FY27
  //   • partial (passes most checks but failing RAM/storage) →
  //     Upgrade RAM/Storage
  //   • compatible → OK
  const currentFyEnd = new Date(new Date().getFullYear() + 1, 5, 30); // ~June end
  const replaceFy26: Device[] = [];
  const replaceFy27: Device[] = [];
  const upgrade: Device[] = [];
  const ok: Device[] = [];

  for (const d of targets) {
    if (isReady(d.win11)) {
      ok.push(d);
    } else if (isUpgradable(d.win11)) {
      upgrade.push(d);
    } else if (isFailed(d.win11)) {
      // Bucket by warranty / age.
      const warranty = d.warrantyEndsAt ? new Date(d.warrantyEndsAt) : null;
      const purchased = d.purchasedAt ? new Date(d.purchasedAt) : null;
      const isOld =
        (warranty && warranty < currentFyEnd) ||
        (purchased &&
          new Date().getFullYear() - purchased.getFullYear() >= 5);
      if (isOld) replaceFy26.push(d);
      else replaceFy27.push(d);
    } else {
      ok.push(d); // unknown → not blocking, manual review
    }
  }

  const fmtAction = (d: Device): string => {
    if (replaceFy26.includes(d)) return "Replace — FY26";
    if (replaceFy27.includes(d)) return "Replace — FY27";
    if (upgrade.includes(d)) return "Upgrade RAM/Storage";
    if (ok.includes(d) && isReady(d.win11)) return "OK";
    return "Review";
  };

  const fmtFailing = (d: Device): string => {
    if (isReady(d.win11)) return "—";
    // Syncro writes the failing checks straight into the string after
    // "Failed:" — surface them verbatim, trimmed.
    if (isFailed(d.win11)) {
      return (d.win11 ?? "")
        .replace(/^failed[:\s]+/i, "")
        .trim();
    }
    return "unknown";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Windows 11 hardware readiness &amp; refresh (2-year)
        </CardTitle>
        <CardDescription>
          {clientName} — devices below Win11 minimum requirements +
          projected refresh by FY. Derived from Syncro
          intel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryStat label="Reviewed" n={totalReviewed} tone="neutral" />
          <SummaryStat label="Not eligible" n={notEligible.length} tone="bad" />
          <SummaryStat label="Replace FY26" n={replaceFy26.length} tone="bad" />
          <SummaryStat
            label="Replace FY27"
            n={replaceFy27.length}
            tone="warn"
          />
          <SummaryStat
            label="Upgrade RAM/Storage"
            n={upgrade.length}
            tone="warn"
          />
        </div>

        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Device</th>
                <th className="px-3 py-2 font-medium">Assigned user</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">RAM</th>
                <th className="px-3 py-2 text-right font-medium">Disk</th>
                <th className="px-3 py-2 font-medium">Win11</th>
                <th className="px-3 py-2 font-medium">Failing</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {targets.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No Windows devices found for this client.
                  </td>
                </tr>
              ) : (
                targets.map((d) => {
                  const action = fmtAction(d);
                  const actionCls =
                    action.startsWith("Replace — FY26")
                      ? "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                      : action.startsWith("Replace — FY27")
                        ? "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                        : action.startsWith("Upgrade")
                          ? "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                          : action === "OK"
                            ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "border-slate-400/40 bg-slate-50 text-slate-600 dark:bg-slate-950/30 dark:text-slate-400";
                  return (
                    <tr
                      key={d.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-1.5 font-medium">
                        {d.label ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">{d.assignedTo ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        {[d.manufacturer, d.model].filter(Boolean).join(" ") ||
                          "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {d.ramGb ? `${d.ramGb}GB` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {d.diskGb ? `${d.diskGb}GB` : "—"}
                      </td>
                      <td className="px-3 py-1.5">{d.win11 ?? "unknown"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {fmtFailing(d)}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${actionCls}`}
                        >
                          {action}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Action logic: Win11{" "}
          <code className="rounded bg-muted px-1">compatible</code> → OK. {" "}
          <code className="rounded bg-muted px-1">partial</code> → upgrade
          RAM/Storage. {" "}
          <code className="rounded bg-muted px-1">not_compatible</code> →
          replace, bucketed FY26 if warranty already expired or hardware ≥
          5 yr old, else FY27. Operator can override via per-device notes;
          inline editing coming in the next iteration.
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "neutral" | "warn" | "bad" | "good";
}) {
  const cls =
    tone === "bad"
      ? "border-red-300 bg-red-50/40 text-red-700 dark:bg-red-950/20 dark:text-red-300"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50/40 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300"
        : tone === "good"
          ? "border-emerald-300 bg-emerald-50/40 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300"
          : "border-slate-300 bg-slate-50/40 text-slate-700 dark:bg-slate-950/20 dark:text-slate-300";
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold tabular-nums">{n}</div>
    </div>
  );
}
