/**
 * Per-client roll-up of Syncro per-asset intel: how many devices have
 * AutoElevate / EntraID / Intune / Threatlocker running, etc.
 *
 * Source of truth is Syncro; this is a read-only summary computed from
 * the hardware rows the page already loaded. Click a row → drill-down
 * to the hardware list (anchor #hardware).
 */
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type HardwareSummary = {
  status: string;
  autoelevateStatus: string | null;
  intuneEnrolled: string | null;
  entraJoined: string | null;
  threatlockerRunning: string | null;
  isKiosk: string | null;
  notOnContract: string | null;
  windows11Readiness: string | null;
};

function isYes(v: string | null): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "running";
}

function isNo(v: string | null): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "no" || s === "false" || s === "0" || s === "not running";
}

function isReady(v: string | null): boolean {
  if (!v) return false;
  return v.trim().toLowerCase().startsWith("ready");
}

export function SyncroIntelRollupCard({
  hardware,
  latestCsat,
  latestCsatComment,
}: {
  hardware: HardwareSummary[];
  latestCsat: number | null;
  latestCsatComment: string | null;
}) {
  // Only consider active devices for the agent roll-up — retired or
  // spare hardware shouldn't drag down a coverage %.
  const active = hardware.filter((h) => h.status === "active");
  const total = active.length;

  type AgentRow = {
    key: string;
    label: string;
    description: string;
    yes: number;
    no: number;
    other: number;
  };

  const tally = (pick: (h: HardwareSummary) => string | null) => {
    let yes = 0;
    let no = 0;
    let other = 0;
    for (const h of active) {
      const v = pick(h);
      if (isYes(v)) yes++;
      else if (isNo(v)) no++;
      else if (v) other++;
    }
    return { yes, no, other };
  };

  const ae = tally((h) => h.autoelevateStatus);
  const entra = tally((h) => h.entraJoined);
  const intune = tally((h) => h.intuneEnrolled);
  const tl = tally((h) => h.threatlockerRunning);

  const agents: AgentRow[] = [
    {
      key: "ae",
      label: "AutoElevate",
      description: "PAM agent — elevates admin actions for non-admin users.",
      ...ae,
    },
    {
      key: "entra",
      label: "EntraID Joined",
      description: "Device is joined to Microsoft Entra ID (Azure AD).",
      ...entra,
    },
    {
      key: "intune",
      label: "Intune Enrolled",
      description: "Device is managed via Microsoft Intune MDM.",
      ...intune,
    },
    {
      key: "tl",
      label: "Threatlocker",
      description: "Application allow-listing / ringfencing agent.",
      ...tl,
    },
  ];

  const w11Ready = active.filter((h) => isReady(h.windows11Readiness)).length;
  const w11Tracked = active.filter((h) => h.windows11Readiness).length;
  const kiosks = active.filter((h) => h.isKiosk === "1").length;
  const notOnContract = active.filter((h) => h.notOnContract === "1").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Syncro intel</CardTitle>
        <p className="text-xs text-muted-foreground">
          Per-device security & compliance signals from Syncro custom
          fields. Drill down in the{" "}
          <Link
            href="#hardware-list-content"
            className="underline underline-offset-2"
          >
            Hardware
          </Link>{" "}
          section.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active hardware in TechOS yet. Pull from Syncro under
            Integrations → Syncro to populate.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {agents.map((a) => {
                const yesPct = total > 0 ? Math.round((a.yes / total) * 100) : 0;
                const noPct = total > 0 ? Math.round((a.no / total) * 100) : 0;
                return (
                  <div key={a.key} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{a.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {a.yes} / {total}
                        <span className="ml-1 text-[10px]">({yesPct}%)</span>
                      </span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded bg-muted">
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${yesPct}%` }}
                      />
                      <div
                        className="bg-rose-400"
                        style={{ width: `${noPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {a.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm md:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Windows 11 Ready
                </div>
                <div className="font-medium tabular-nums">
                  {w11Ready} / {w11Tracked}
                  {w11Tracked > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({Math.round((w11Ready / w11Tracked) * 100)}%)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Kiosks
                </div>
                <div className="font-medium tabular-nums">{kiosks}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Not on Contract
                </div>
                <div className="font-medium tabular-nums">{notOnContract}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Active devices
                </div>
                <div className="font-medium tabular-nums">{total}</div>
              </div>
            </div>

            {(latestCsat !== null || latestCsatComment) && (
              <div className="border-t pt-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Latest CSAT
                </div>
                <div className="mt-1 flex items-center gap-3">
                  {latestCsat !== null && (
                    <Badge
                      variant="default"
                      className={
                        latestCsat >= 4
                          ? "bg-emerald-600 hover:bg-emerald-600/90"
                          : latestCsat === 3
                            ? "bg-amber-500 hover:bg-amber-500/90"
                            : "bg-rose-600 hover:bg-rose-600/90"
                      }
                    >
                      {latestCsat} / 5
                    </Badge>
                  )}
                  {latestCsatComment && (
                    <p className="text-sm italic text-muted-foreground">
                      “{latestCsatComment}”
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
