/**
 * Per-client "At-risk devices" card.
 *
 * Surfaces every active hardware row whose risk classifier returned
 * at least one flag — typically: EOL OS, can't reach Windows 11, marked
 * end-of-life, out of warranty, not Intune-enrolled / Entra-joined,
 * or hasn't checked in for a long time.
 *
 * Defaults collapsed (the list can be long); the header summary keeps
 * the critical / warning / info counts visible at a glance.
 */
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  classifyDeviceRisk,
  summariseRisk,
  type HardwareForRisk,
  type RiskFlag,
  type RiskSeverity,
} from "@/lib/devices/at-risk";

export type AtRiskHardwareRow = HardwareForRisk & {
  id: string;
  label: string;
  kind: string;
  assetTag: string | null;
  serialNumber: string | null;
  assignedToLabel: string | null;
  locationLabel?: string | null;
};

const SEV_BADGE: Record<
  RiskSeverity,
  { label: string; className: string }
> = {
  critical: {
    label: "Critical",
    className: "bg-rose-100 text-rose-700 border-rose-200",
  },
  warning: {
    label: "Warning",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  info: {
    label: "Info",
    className: "bg-sky-100 text-sky-700 border-sky-200",
  },
};

const SEV_DOT: Record<RiskSeverity, string> = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
};

export function AtRiskDevicesCard({
  hardware,
}: {
  hardware: AtRiskHardwareRow[];
}) {
  const [expanded, setExpanded] = useState(false);

  // Compute risk per device, then build the at-risk subset + summary.
  const { atRisk, summary } = useMemo(() => {
    const flagsByDevice: RiskFlag[][] = [];
    const matched: Array<AtRiskHardwareRow & { flags: RiskFlag[] }> = [];
    const activeDevices = hardware.filter((h) => h.status === "active");
    for (const h of activeDevices) {
      const flags = classifyDeviceRisk(h);
      flagsByDevice.push(flags);
      if (flags.length > 0) matched.push({ ...h, flags });
    }
    // Sort matched rows so the worst devices float to the top.
    matched.sort((a, b) => {
      const aw = worstSeverity(a.flags);
      const bw = worstSeverity(b.flags);
      const order: Record<RiskSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      const cmp = order[aw] - order[bw];
      if (cmp !== 0) return cmp;
      // Secondary: by count of flags desc (more red = higher)
      const cnt = b.flags.length - a.flags.length;
      if (cnt !== 0) return cnt;
      return a.label.localeCompare(b.label);
    });
    return { atRisk: matched, summary: summariseRisk(flagsByDevice) };
  }, [hardware]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-2 text-left"
          aria-expanded={expanded}
          aria-controls="at-risk-content"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-rose-500" />
              At-risk devices
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Active hardware that's hard to keep patched: EOL OS,
              can't reach Windows 11, out of warranty, no MDM,
              or hasn't heart-beat in a while.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <SummaryChip
                severity="critical"
                count={summary.critical}
                total={summary.totalActiveDevices}
              />
              <SummaryChip
                severity="warning"
                count={summary.warning}
                total={summary.totalActiveDevices}
              />
              <SummaryChip
                severity="info"
                count={summary.info}
                total={summary.totalActiveDevices}
              />
              <span className="text-[11px] text-muted-foreground">
                {summary.atRiskDeviceCount} / {summary.totalActiveDevices}{" "}
                active device{summary.totalActiveDevices === 1 ? "" : "s"}{" "}
                flagged
                {summary.totalActiveDevices > 0 &&
                  ` (${Math.round(
                    (summary.atRiskDeviceCount / summary.totalActiveDevices) *
                      100,
                  )}%)`}
              </span>
            </div>
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent id="at-risk-content" className="space-y-3">
          {atRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active devices are currently flagged. 🎉
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Device</th>
                    <th className="px-3 py-1.5 font-medium">OS</th>
                    <th className="px-3 py-1.5 font-medium">Assigned</th>
                    <th className="px-3 py-1.5 font-medium">Location</th>
                    <th className="px-3 py-1.5 font-medium">Risk flags</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map((h) => (
                    <tr key={h.id} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{h.label}</div>
                        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                          {h.assetTag && <span>{h.assetTag}</span>}
                          {h.serialNumber && <span>SN: {h.serialNumber}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">
                        {[h.osName, h.osVersion].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {h.assignedToLabel || "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {h.locationLabel || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {h.flags.map((f) => (
                            <span
                              key={f.code}
                              title={f.detail ?? f.label}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${SEV_BADGE[f.severity].className}`}
                            >
                              <span
                                className={`inline-block size-1.5 rounded-full ${SEV_DOT[f.severity]}`}
                                aria-hidden
                              />
                              {f.label}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function SummaryChip({
  severity,
  count,
  total,
}: {
  severity: RiskSeverity;
  count: number;
  total: number;
}) {
  const Icon =
    severity === "critical"
      ? AlertTriangle
      : severity === "warning"
        ? AlertTriangle
        : Info;
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] uppercase tracking-wider ${
        count > 0 ? SEV_BADGE[severity].className : "opacity-60"
      }`}
      title={`${count} of ${total} active devices flagged at ${severity}`}
    >
      <Icon className="size-3" /> {SEV_BADGE[severity].label}: {count}
    </Badge>
  );
}

function worstSeverity(flags: RiskFlag[]): RiskSeverity {
  if (flags.some((f) => f.severity === "critical")) return "critical";
  if (flags.some((f) => f.severity === "warning")) return "warning";
  return "info";
}
