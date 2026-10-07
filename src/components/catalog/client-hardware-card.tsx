"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createHardware,
  deleteHardware,
  setHardwareBillingTier,
  updateHardware,
} from "@/server/actions/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnePasswordLink } from "./onepassword-link";

type Kind =
  | "server"
  | "workstation"
  | "laptop"
  | "firewall"
  | "switch"
  | "ap"
  | "printer"
  | "phone"
  | "mobile"
  | "tablet"
  | "appliance"
  | "other";

type Status = "active" | "spare" | "retired" | "lost";

type BillingTier =
  | "full_compute_node"
  | "kiosk_node"
  | "virtual_machine_node"
  | "managed_mobile_device"
  | "not_billable";

const BILLING_TIER_LABEL: Record<BillingTier, string> = {
  full_compute_node: "Full Compute",
  kiosk_node: "Kiosk",
  virtual_machine_node: "VM",
  managed_mobile_device: "Mobile",
  not_billable: "Not billable",
};

const BILLING_TIER_ORDER: BillingTier[] = [
  "full_compute_node",
  "kiosk_node",
  "virtual_machine_node",
  "managed_mobile_device",
  "not_billable",
];

const KIND_LABEL: Record<Kind, string> = {
  server: "Server",
  workstation: "Workstation",
  laptop: "Laptop",
  firewall: "Firewall",
  switch: "Switch",
  ap: "AP",
  printer: "Printer",
  phone: "Phone",
  mobile: "Mobile",
  tablet: "Tablet",
  appliance: "Appliance",
  other: "Other",
};

/**
 * The runbook-enrichment script writes a fenced block into `notes`:
 *
 *   <!-- runbook-mentions:begin -->
 *   Runbook mentions: Sedalia, Marshall
 *   <!-- runbook-mentions:end -->
 *
 * Pull the page-title list out so the row can show a "📖 N" badge, and
 * return the remaining human-authored notes separately so they aren't
 * shadowed by the auto block.
 */
function parseRunbookMentions(notes: string | null): {
  pages: string[];
  userNotes: string;
} {
  if (!notes) return { pages: [], userNotes: "" };
  const re =
    /<!--\s*runbook-mentions:begin\s*-->([\s\S]*?)<!--\s*runbook-mentions:end\s*-->/;
  const m = notes.match(re);
  if (!m) return { pages: [], userNotes: notes };
  const inner = m[1].trim();
  const listMatch = inner.match(/^Runbook mentions:\s*(.+)$/m);
  const pages = listMatch
    ? listMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const userNotes = notes.replace(re, "").trim();
  return { pages, userNotes };
}

const KIND_ORDER: Kind[] = [
  "server",
  "firewall",
  "switch",
  "ap",
  "appliance",
  "workstation",
  "laptop",
  "tablet",
  "mobile",
  "phone",
  "printer",
  "other",
];

export type HardwareRow = {
  id: string;
  kind: Kind;
  label: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  status: Status;
  billingTier: BillingTier;
  purchasedAt: string | null;
  warrantyEndsAt: string | null;
  osName: string | null;
  osVersion: string | null;
  cpuLabel: string | null;
  ramGb: number | null;
  diskGb: number | null;
  lastIp: string | null;
  lastSeenAt: Date | string | null;
  isEol: boolean;
  eolDate: string | null;
  rmmAgent: string | null;
  edrAgent: string | null;
  backupAgent: string | null;
  assignedToLabel: string | null;
  assignedToEmail: string | null;
  onePasswordItemUrl: string | null;
  notes: string | null;
  locationId: string | null;
  locationLabel: string | null;
  vendorId: string | null;
  /** Set when this hardware row came from / is linked to Syncro. When
   *  set, certain fields (including billingTier) are read-only in
   *  TechOS — Syncro is the source of truth. */
  syncroAssetId?: string | null;
  // ---- Syncro per-asset intel (source of truth: Syncro) ----
  notOnContract?: string | null;
  isKiosk?: string | null;
  autoelevateStatus?: string | null;
  intuneEnrolled?: string | null;
  entraJoined?: string | null;
  threatlockerRunning?: string | null;
  windows11Readiness?: string | null;
  customerAssetTag?: string | null;
  usiAssetTag?: string | null;
  splashtopUuid?: string | null;
  localAdministrators?: string | null;
  imei?: string | null;
};

type LocationOpt = { id: string; label: string };
type VendorOpt = { id: string; name: string };

export function ClientHardwareCard({
  clientId,
  hardware,
  locations,
  vendors,
  canEdit,
}: {
  clientId: string;
  hardware: HardwareRow[];
  locations: LocationOpt[];
  vendors: VendorOpt[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openIntelId, setOpenIntelId] = useState<string | null>(null);
  // Default collapsed — the hardware list is long for large clients and
  // crowds out the rest of the page. Click the header to expand.
  const [expanded, setExpanded] = useState(false);

  // Resolve locationId → label using the locations array passed in,
  // so the table can show a Location column even if the parent didn't
  // pre-join the label.
  const locById = new Map(locations.map((l) => [l.id, l.label] as const));

  const grouped = new Map<Kind, HardwareRow[]>();
  for (const h of hardware) {
    const arr = grouped.get(h.kind) ?? [];
    arr.push(h);
    grouped.set(h.kind, arr);
  }

  const eolCount = hardware.filter((h) => h.isEol).length;
  const noVaultCount = hardware.filter((h) => !h.onePasswordItemUrl).length;

  // Count active hardware per billing tier — drives the summary chips that
  // tell the user at a glance how many billable nodes will appear on the
  // monthly statement.
  const activeByTier = (tier: BillingTier) =>
    hardware.filter((h) => h.status === "active" && h.billingTier === tier).length;
  const tierCounts: Record<BillingTier, number> = {
    full_compute_node: activeByTier("full_compute_node"),
    kiosk_node: activeByTier("kiosk_node"),
    virtual_machine_node: activeByTier("virtual_machine_node"),
    managed_mobile_device: activeByTier("managed_mobile_device"),
    not_billable: activeByTier("not_billable"),
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-2 text-left"
          aria-expanded={expanded}
          aria-controls="hardware-list-content"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <CardTitle>Hardware</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {hardware.length} item{hardware.length === 1 ? "" : "s"}
              {eolCount > 0 && ` · ${eolCount} EOL`}
              {noVaultCount > 0 && ` · ${noVaultCount} without vault link`}
              {!expanded && hardware.length > 0 && " · click to expand"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {BILLING_TIER_ORDER.map((tier) => (
                <Badge
                  key={tier}
                  variant={tier === "not_billable" ? "outline" : "secondary"}
                  className="text-[10px] uppercase tracking-wider"
                  title={`${tierCounts[tier]} active ${BILLING_TIER_LABEL[tier]} node${tierCounts[tier] === 1 ? "" : "s"}`}
                >
                  {BILLING_TIER_LABEL[tier]}: {tierCounts[tier]}
                </Badge>
              ))}
            </div>
          </div>
        </button>
        {canEdit && expanded && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Hardware
          </Button>
        )}
      </CardHeader>
      {expanded && (
      <CardContent id="hardware-list-content" className="space-y-4">
        {adding && (
          <HardwareForm
            clientId={clientId}
            locations={locations}
            vendors={vendors}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {hardware.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No hardware tracked yet.</p>
        )}
        {KIND_ORDER.filter((k) => grouped.has(k)).map((kind) => (
          <div key={kind} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[kind]}
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Label</th>
                    <th className="px-3 py-1.5 font-medium">Model / OS</th>
                    <th className="px-3 py-1.5 font-medium">Specs</th>
                    <th className="px-3 py-1.5 font-medium">Last IP / Seen</th>
                    <th className="px-3 py-1.5 font-medium">Location</th>
                    <th className="px-3 py-1.5 font-medium">Assigned</th>
                    <th className="px-3 py-1.5 font-medium">Agents</th>
                    <th className="px-3 py-1.5 font-medium">Billing tier</th>
                    <th className="px-3 py-1.5 font-medium">Vault</th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {(grouped.get(kind) ?? []).map((h) => {
                    const locationLabel =
                      h.locationLabel ??
                      (h.locationId ? locById.get(h.locationId) ?? null : null);
                    if (editingId === h.id) {
                      return (
                        <tr key={h.id}>
                          <td colSpan={10} className="p-3">
                            <HardwareForm
                              clientId={clientId}
                              hardware={h}
                              locations={locations}
                              vendors={vendors}
                              onDone={() => setEditingId(null)}
                              onCancel={() => setEditingId(null)}
                            />
                          </td>
                        </tr>
                      );
                    }
                    const intelOpen = openIntelId === h.id;
                    return (
                      <Fragment key={h.id}>
                        <HardwareRowView
                          clientId={clientId}
                          hw={h}
                          locationLabel={locationLabel}
                          canEdit={canEdit}
                          intelOpen={intelOpen}
                          onToggleIntel={() =>
                            setOpenIntelId((cur) => (cur === h.id ? null : h.id))
                          }
                          onEdit={() => setEditingId(h.id)}
                        />
                        {intelOpen && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={10} className="p-3">
                              <SyncroIntelDetail hw={h} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
      )}
    </Card>
  );
}

function HardwareRowView({
  clientId,
  hw,
  locationLabel,
  canEdit,
  intelOpen,
  onToggleIntel,
  onEdit,
}: {
  clientId: string;
  hw: HardwareRow;
  locationLabel: string | null;
  canEdit: boolean;
  intelOpen: boolean;
  onToggleIntel: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${hw.label}"?`)) return;
    start(async () => {
      const r = await deleteHardware({ hardwareId: hw.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Hardware removed");
        router.refresh();
      }
    });
  };

  const lastSeen =
    hw.lastSeenAt &&
    new Date(hw.lastSeenAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // Surface runbook pages that name this device (populated by
  // scripts/enrich-hardware-from-runbook.ts).
  const { pages: runbookMentions } = parseRunbookMentions(hw.notes);

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{hw.label}</div>
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          {hw.assetTag && <span>{hw.assetTag}</span>}
          {hw.serialNumber && <span>SN: {hw.serialNumber}</span>}
          {hw.status !== "active" && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {hw.status}
            </Badge>
          )}
          {hw.isEol && (
            <Badge variant="destructive" className="text-[10px] uppercase">
              <AlertTriangle className="mr-0.5 size-2.5" /> EOL
            </Badge>
          )}
          {runbookMentions.length > 0 && (
            <Badge
              variant="outline"
              className="gap-0.5 text-[10px]"
              title={`Mentioned in runbook page${runbookMentions.length === 1 ? "" : "s"}: ${runbookMentions.join(", ")}`}
            >
              <BookOpen className="size-2.5" /> {runbookMentions.length}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        {[hw.manufacturer, hw.model].filter(Boolean).join(" ")}
        {hw.osName && (
          <div className="text-[10px] text-muted-foreground">
            {hw.osName} {hw.osVersion}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground">
        {[
          hw.cpuLabel,
          hw.ramGb && `${hw.ramGb} GB RAM`,
          hw.diskGb && `${hw.diskGb} GB`,
        ]
          .filter(Boolean)
          .join(" · ") || "—"}
      </td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground">
        {hw.lastIp || "—"}
        {lastSeen && <div>{lastSeen}</div>}
      </td>
      <td className="px-3 py-2 text-[11px]">{locationLabel || "—"}</td>
      <td className="px-3 py-2">{hw.assignedToLabel || "—"}</td>
      <td className="px-3 py-2">
        <AgentBadges hw={hw} onClick={onToggleIntel} open={intelOpen} />
      </td>
      <td className="px-3 py-2">
        <BillingTierSelect
          clientId={clientId}
          hardwareId={hw.id}
          value={hw.billingTier}
          // Syncro-linked devices have their tier derived from Syncro
          // (Kiosk flag, form_factor, asset_type). Lock the dropdown so
          // it can only be changed by editing the source in Syncro.
          canEdit={canEdit && !hw.syncroAssetId}
          syncroLinked={!!hw.syncroAssetId}
        />
      </td>
      <td className="px-3 py-2">
        <OnePasswordLink url={hw.onePasswordItemUrl} size="xs" />
      </td>
      <td className="px-3 py-2 text-right">
        {canEdit && (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={pending}
              aria-label="Remove"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function BillingTierSelect({
  clientId,
  hardwareId,
  value,
  canEdit,
  syncroLinked = false,
}: {
  clientId: string;
  hardwareId: string;
  value: BillingTier;
  canEdit: boolean;
  syncroLinked?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tier, setTier] = useState<BillingTier>(value);

  if (!canEdit) {
    return (
      <Badge
        variant={tier === "not_billable" ? "outline" : "secondary"}
        className="text-[10px] uppercase"
        title={
          syncroLinked
            ? "Source: Syncro. Change the Kiosk / form_factor / asset_type in Syncro to update."
            : undefined
        }
      >
        {BILLING_TIER_LABEL[tier]}
        {syncroLinked && (
          <span className="ml-1 opacity-60" aria-hidden>
            🔒
          </span>
        )}
      </Badge>
    );
  }

  const onChange = (next: BillingTier) => {
    const prev = tier;
    setTier(next);
    start(async () => {
      const r = await setHardwareBillingTier({
        hardwareId,
        clientId,
        billingTier: next,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        setTier(prev);
      } else {
        toast.success("Billing tier updated");
        router.refresh();
      }
    });
  };

  return (
    <select
      value={tier}
      onChange={(e) => onChange(e.target.value as BillingTier)}
      disabled={pending}
      className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] uppercase tracking-wider"
    >
      {BILLING_TIER_ORDER.map((t) => (
        <option key={t} value={t}>
          {BILLING_TIER_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

/**
 * Compact agent / security state badges per device. Each badge maps to
 * a Syncro per-asset custom field; colour shows running state. Click
 * toggles the detail panel below the row.
 */
function AgentBadges({
  hw,
  onClick,
  open,
}: {
  hw: HardwareRow;
  onClick: () => void;
  open: boolean;
}) {
  type AgentDef = {
    key: string;
    label: string;
    value: string | null | undefined;
  };
  const agents: AgentDef[] = [
    { key: "AE", label: "AutoElevate", value: hw.autoelevateStatus },
    { key: "EID", label: "EntraID Joined", value: hw.entraJoined },
    { key: "Int", label: "Intune Enrolled", value: hw.intuneEnrolled },
    { key: "TL", label: "Threatlocker", value: hw.threatlockerRunning },
  ];
  const variantFor = (v: string | null | undefined) => {
    if (!v) return "outline" as const;
    const s = v.trim().toLowerCase();
    if (s === "yes" || s === "true" || s === "1" || s === "running") return "good";
    if (s === "no" || s === "false" || s === "0" || s === "not running") return "bad";
    return "neutral" as const;
  };
  const className = (variant: "good" | "bad" | "neutral" | "outline") => {
    switch (variant) {
      case "good":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "bad":
        return "bg-rose-100 text-rose-700 border-rose-200";
      case "neutral":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-muted text-muted-foreground border-transparent";
    }
  };
  const flags: string[] = [];
  if (hw.notOnContract === "1") flags.push("NoC");
  if (hw.isKiosk === "1") flags.push("Kiosk");
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show Syncro intel"
      aria-expanded={open}
      className="flex flex-wrap items-center gap-0.5"
    >
      {agents.map((a) => {
        const v = variantFor(a.value);
        return (
          <span
            key={a.key}
            title={`${a.label}: ${a.value ?? "—"}`}
            className={`rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wider ${className(v)}`}
          >
            {a.key}
          </span>
        );
      })}
      {flags.map((f) => (
        <span
          key={f}
          title={f === "NoC" ? "Not on Contract" : "Kiosk"}
          className={`rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wider ${
            f === "NoC"
              ? "bg-zinc-200 text-zinc-700 border-zinc-300"
              : "bg-sky-100 text-sky-700 border-sky-200"
          }`}
        >
          {f}
        </span>
      ))}
    </button>
  );
}

/**
 * Full Syncro intel panel rendered below a hardware row when expanded.
 * Shows every per-asset Syncro custom field we capture, plus a few
 * derived helpers (Win11 ready or not, local admins formatted, etc.).
 */
function SyncroIntelDetail({ hw }: { hw: HardwareRow }) {
  const items: Array<{ label: string; value: string | null | undefined }> = [
    { label: "AutoElevate Running", value: hw.autoelevateStatus },
    { label: "EntraID Joined", value: hw.entraJoined },
    { label: "Intune Enrolled", value: hw.intuneEnrolled },
    { label: "Threatlocker Running", value: hw.threatlockerRunning },
    { label: "Kiosk", value: hw.isKiosk },
    { label: "Not on Contract", value: hw.notOnContract },
    { label: "Windows 11 Readiness", value: hw.windows11Readiness },
    { label: "Customer Asset Tag", value: hw.customerAssetTag },
    { label: "USI Asset Tag", value: hw.usiAssetTag },
    { label: "IMEI", value: hw.imei },
    { label: "Splashtop UUID", value: hw.splashtopUuid },
  ];
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Syncro intel · source of truth: Syncro
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs md:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="flex items-baseline gap-2">
            <dt className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
              {i.label}
            </dt>
            <dd className="font-medium">{i.value || "—"}</dd>
          </div>
        ))}
      </dl>
      {hw.localAdministrators && (
        <div className="space-y-1 pt-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Local administrators
          </div>
          <div className="flex flex-wrap gap-1">
            {hw.localAdministrators.split(/\s+/).filter(Boolean).map((u, i) => (
              <code
                key={`${u}-${i}`}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
              >
                {u}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HardwareForm({
  clientId,
  hardware,
  locations,
  vendors,
  onDone,
  onCancel,
}: {
  clientId: string;
  hardware?: HardwareRow;
  locations: LocationOpt[];
  vendors: VendorOpt[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [kind, setKind] = useState<Kind>(hardware?.kind ?? "laptop");
  const [label, setLabel] = useState(hardware?.label ?? "");
  const [manufacturer, setManufacturer] = useState(hardware?.manufacturer ?? "");
  const [model, setModel] = useState(hardware?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(hardware?.serialNumber ?? "");
  const [assetTag, setAssetTag] = useState(hardware?.assetTag ?? "");
  const [status, setStatus] = useState<Status>(hardware?.status ?? "active");
  const [billingTier, setBillingTier] = useState<BillingTier>(
    hardware?.billingTier ?? "full_compute_node",
  );
  const [osName, setOsName] = useState(hardware?.osName ?? "");
  const [osVersion, setOsVersion] = useState(hardware?.osVersion ?? "");
  const [cpuLabel, setCpuLabel] = useState(hardware?.cpuLabel ?? "");
  const [ramGb, setRamGb] = useState(hardware?.ramGb?.toString() ?? "");
  const [diskGb, setDiskGb] = useState(hardware?.diskGb?.toString() ?? "");
  const [lastIp, setLastIp] = useState(hardware?.lastIp ?? "");
  const [isEol, setIsEol] = useState(hardware?.isEol ?? false);
  const [rmmAgent, setRmmAgent] = useState(hardware?.rmmAgent ?? "");
  const [edrAgent, setEdrAgent] = useState(hardware?.edrAgent ?? "");
  const [backupAgent, setBackupAgent] = useState(hardware?.backupAgent ?? "");
  const [assignedToLabel, setAssignedToLabel] = useState(hardware?.assignedToLabel ?? "");
  const [assignedToEmail, setAssignedToEmail] = useState(hardware?.assignedToEmail ?? "");
  const [locationId, setLocationId] = useState(hardware?.locationId ?? "");
  const [vendorId, setVendorId] = useState(hardware?.vendorId ?? "");
  const [onePasswordItemUrl, setOnePasswordItemUrl] = useState(
    hardware?.onePasswordItemUrl ?? "",
  );
  // Split the auto-generated runbook-mentions block off so the textarea
  // only shows the human-authored portion. We re-attach the block on
  // save so the enrichment isn't accidentally wiped by an edit.
  const initialParsed = parseRunbookMentions(hardware?.notes ?? null);
  const runbookBlock = initialParsed.pages.length
    ? hardware?.notes?.match(
        /<!--\s*runbook-mentions:begin\s*-->[\s\S]*?<!--\s*runbook-mentions:end\s*-->/,
      )?.[0] ?? null
    : null;
  const [notes, setNotes] = useState(initialParsed.userNotes);

  const submit = () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        kind,
        label: label.trim(),
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serialNumber: serialNumber.trim() || null,
        assetTag: assetTag.trim() || null,
        status,
        billingTier,
        purchasedAt: null,
        warrantyEndsAt: null,
        osName: osName.trim() || null,
        osVersion: osVersion.trim() || null,
        cpuLabel: cpuLabel.trim() || null,
        ramGb: ramGb ? parseInt(ramGb, 10) : null,
        diskGb: diskGb ? parseInt(diskGb, 10) : null,
        lastIp: lastIp.trim() || null,
        lastSeenAt: null,
        isEol,
        eolDate: null,
        rmmAgent: rmmAgent.trim() || null,
        edrAgent: edrAgent.trim() || null,
        backupAgent: backupAgent.trim() || null,
        assignedToLabel: assignedToLabel.trim() || null,
        assignedToEmail: assignedToEmail.trim() || null,
        locationId: locationId || null,
        vendorId: vendorId || null,
        onePasswordItemUrl: onePasswordItemUrl.trim() || null,
        // Preserve the auto-managed runbook-mentions block across edits.
        notes: (() => {
          const userPart = notes.trim();
          if (!runbookBlock) return userPart || null;
          return userPart ? `${userPart}\n\n${runbookBlock}` : runbookBlock;
        })(),
      };
      const r = hardware
        ? await updateHardware({ ...payload, hardwareId: hardware.id })
        : await createHardware(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(hardware ? "Hardware updated" : "Hardware added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Label / hostname</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="spare">Spare</option>
            <option value="retired">Retired</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <div>
          <Label>
            Billing tier
            {hardware?.syncroAssetId && (
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                🔒 Syncro-controlled
              </span>
            )}
          </Label>
          <select
            value={billingTier}
            onChange={(e) => setBillingTier(e.target.value as BillingTier)}
            disabled={!!hardware?.syncroAssetId}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            title={
              hardware?.syncroAssetId
                ? "Source: Syncro. Change the Kiosk / form_factor / asset_type in Syncro to update."
                : undefined
            }
          >
            {BILLING_TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {BILLING_TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Manufacturer</Label>
          <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </div>
        <div>
          <Label>Model</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <Label>Serial number</Label>
          <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
        </div>
        <div>
          <Label>Asset tag</Label>
          <Input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} />
        </div>
        <div>
          <Label>Location</Label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Vendor</Label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>OS name</Label>
          <Input value={osName} onChange={(e) => setOsName(e.target.value)} />
        </div>
        <div>
          <Label>OS version</Label>
          <Input value={osVersion} onChange={(e) => setOsVersion(e.target.value)} />
        </div>
        <div>
          <Label>CPU</Label>
          <Input value={cpuLabel} onChange={(e) => setCpuLabel(e.target.value)} />
        </div>
        <div>
          <Label>RAM (GB)</Label>
          <Input
            type="number"
            min="0"
            value={ramGb}
            onChange={(e) => setRamGb(e.target.value)}
          />
        </div>
        <div>
          <Label>Disk (GB)</Label>
          <Input
            type="number"
            min="0"
            value={diskGb}
            onChange={(e) => setDiskGb(e.target.value)}
          />
        </div>
        <div>
          <Label>Last IP</Label>
          <Input value={lastIp} onChange={(e) => setLastIp(e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isEol} onChange={(e) => setIsEol(e.target.checked)} />
        End of life / past vendor support
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>RMM agent</Label>
          <Input
            value={rmmAgent}
            onChange={(e) => setRmmAgent(e.target.value)}
            placeholder="RMM agent name"
          />
        </div>
        <div>
          <Label>EDR agent</Label>
          <Input
            value={edrAgent}
            onChange={(e) => setEdrAgent(e.target.value)}
            placeholder="EDR agent name"
          />
        </div>
        <div>
          <Label>Backup agent</Label>
          <Input
            value={backupAgent}
            onChange={(e) => setBackupAgent(e.target.value)}
            placeholder="Backup agent name"
          />
        </div>
        <div>
          <Label>Assigned to (name)</Label>
          <Input
            value={assignedToLabel}
            onChange={(e) => setAssignedToLabel(e.target.value)}
          />
        </div>
        <div>
          <Label>Assigned to (email)</Label>
          <Input
            type="email"
            value={assignedToEmail}
            onChange={(e) => setAssignedToEmail(e.target.value)}
          />
        </div>
        <div>
          <Label>1Password URL</Label>
          <Input
            value={onePasswordItemUrl}
            onChange={(e) => setOnePasswordItemUrl(e.target.value)}
            placeholder="https://start.1password.com/..."
          />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : hardware ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
