"use client";

/**
 * Inventory grid for a site survey. Items are grouped by domain
 * (Endpoints / Network / Servers / etc.). Each row shows the polymorphic
 * fields (label, kind-specific spec dump, condition, recommended action,
 * remediation cost). Click "Add item" inside a group to create one
 * pre-filtered to that group's kinds.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addSurveyItem,
  deleteSurveyItem,
  updateSurveyItem,
} from "@/server/actions/site-surveys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ITEM_KIND_LABEL: Record<string, string> = {
  workstation: "Workstation / Desktop",
  laptop: "Laptop",
  monitor: "Monitor",
  tablet: "Tablet",
  phone_handset: "Phone handset",
  voice_gateway: "Voice gateway / PBX",
  server_physical: "Server (physical)",
  server_virtual: "Server (VM)",
  storage_array: "Storage array / NAS / SAN",
  firewall: "Firewall",
  router: "Router",
  switch: "Switch",
  wireless_ap: "Wireless AP",
  wireless_controller: "Wireless controller",
  patch_panel: "Patch panel",
  rack: "Rack",
  ups: "UPS",
  pdu: "PDU",
  modem: "Modem / ONT",
  printer: "Printer",
  mfp: "MFP / copier",
  scanner: "Scanner",
  camera: "Camera",
  nvr: "NVR / DVR",
  intercom: "Intercom / paging",
  tv_signage: "TV / Signage",
  projector: "Projector",
  speaker_system: "Speaker / audio",
  pos_terminal: "POS terminal",
  kiosk: "Kiosk",
  specialty_equipment: "Specialty equipment",
  peripheral_keyboard: "Keyboard",
  peripheral_mouse: "Mouse",
  peripheral_dock: "Dock",
  peripheral_headset: "Headset",
  peripheral_other: "Peripheral (other)",
  cabling: "Cabling",
  other: "Other",
};

const CONDITION_TONE: Record<string, string> = {
  new: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fair: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  aging: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  eol: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  dead: "bg-rose-600/15 text-rose-700 dark:text-rose-300",
  unknown: "bg-muted text-muted-foreground",
};

const ACTION_TONE: Record<string, string> = {
  keep: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  monitor: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  refresh_planned: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  refresh_now: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  replace: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  decommission: "bg-rose-600/15 text-rose-700 dark:text-rose-300",
  investigate: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  unknown: "bg-muted text-muted-foreground",
};

const ACTION_LABEL: Record<string, string> = {
  keep: "Keep",
  monitor: "Monitor",
  refresh_planned: "Refresh (planned)",
  refresh_now: "Refresh (now)",
  replace: "Replace",
  decommission: "Decommission",
  investigate: "Investigate",
  unknown: "TBD",
};

export type InventoryItem = {
  id: string;
  kind: string;
  label: string;
  assetTag: string | null;
  hostname: string | null;
  serialNumber: string | null;
  make: string | null;
  model: string | null;
  room: string | null;
  userAssigned: string | null;
  details: Record<string, unknown>;
  installDate: string | Date | null;
  warrantyEnd: string | Date | null;
  condition: string;
  recommendedAction: string;
  remediationCostLowCents: number | null;
  remediationCostHighCents: number | null;
  notes: string | null;
  quantity: number;
};

export type InventoryGroup = {
  group: string;
  label: string;
  kinds: string[];
};

export function InventoryGrid({
  surveyId,
  items,
  groups,
  canEdit,
}: {
  surveyId: string;
  items: InventoryItem[];
  groups: InventoryGroup[];
  canEdit: boolean;
}) {
  // Tally items by kind so groups display a count badge.
  const byGroup = new Map<string, InventoryItem[]>();
  for (const g of groups) byGroup.set(g.group, []);
  // "Other" bucket for kinds that don't match any group.
  byGroup.set("__ungrouped__", []);
  for (const item of items) {
    const g = groups.find((g) => g.kinds.includes(item.kind));
    if (g) byGroup.get(g.group)!.push(item);
    else byGroup.get("__ungrouped__")!.push(item);
  }
  const ungrouped = byGroup.get("__ungrouped__") ?? [];

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <GroupSection
          key={g.group}
          surveyId={surveyId}
          group={g}
          items={byGroup.get(g.group) ?? []}
          canEdit={canEdit}
        />
      ))}
      {ungrouped.length > 0 && (
        <GroupSection
          surveyId={surveyId}
          group={{
            group: "__ungrouped__",
            label: "Ungrouped",
            kinds: ["other"],
          }}
          items={ungrouped}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

function GroupSection({
  surveyId,
  group,
  items,
  canEdit,
}: {
  surveyId: string;
  group: InventoryGroup;
  items: InventoryItem[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(items.length > 0);
  const [showAdd, setShowAdd] = useState(false);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <span className="font-semibold">{group.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {items.length} row{items.length === 1 ? "" : "s"}
            {totalQty !== items.length ? ` · ${totalQty} units` : ""}
          </span>
        </button>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(true);
              setShowAdd(true);
            }}
          >
            <Plus className="mr-1 size-3.5" /> Add
          </Button>
        )}
      </div>
      {open && (
        <div className="space-y-2 px-3 py-2">
          {showAdd && canEdit && (
            <NewItemForm
              surveyId={surveyId}
              groupKinds={group.kinds}
              onClose={() => setShowAdd(false)}
            />
          )}
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">No items yet.</p>
          ) : (
            items.map((it) => (
              <ItemRow
                key={it.id}
                surveyId={surveyId}
                item={it}
                canEdit={canEdit}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  surveyId,
  item,
  canEdit,
}: {
  surveyId: string;
  item: InventoryItem;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="rounded border bg-muted/10 p-2">
        <ItemForm
          surveyId={surveyId}
          item={item}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }
  // Render kind-specific spec line from `details`.
  const specs = formatDetails(item);
  return (
    <div className="rounded border bg-card p-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{item.label}</span>
            {item.quantity > 1 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                ×{item.quantity}
              </span>
            )}
            <span className="rounded bg-muted/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {ITEM_KIND_LABEL[item.kind] ?? item.kind}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider ${CONDITION_TONE[item.condition]}`}
            >
              {item.condition}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider ${ACTION_TONE[item.recommendedAction]}`}
            >
              {ACTION_LABEL[item.recommendedAction] ?? item.recommendedAction}
            </Badge>
          </div>
          {(item.make || item.model) && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {[item.make, item.model].filter(Boolean).join(" ")}
            </div>
          )}
          {(item.room || item.userAssigned) && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {item.room ? `📍 ${item.room}` : ""}
              {item.room && item.userAssigned ? "  ·  " : ""}
              {item.userAssigned ? `👤 ${item.userAssigned}` : ""}
            </div>
          )}
          {(item.assetTag || item.hostname || item.serialNumber) && (
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {[
                item.assetTag && `tag: ${item.assetTag}`,
                item.hostname && `host: ${item.hostname}`,
                item.serialNumber && `s/n: ${item.serialNumber}`,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </div>
          )}
          {specs && (
            <div className="mt-1 text-xs text-muted-foreground">{specs}</div>
          )}
          {(item.remediationCostLowCents !== null ||
            item.remediationCostHighCents !== null) && (
            <div className="mt-0.5 text-xs">
              <span className="text-muted-foreground">Remediation: </span>
              <span className="font-medium">
                {item.remediationCostLowCents !== null
                  ? `$${(item.remediationCostLowCents / 100).toLocaleString()}`
                  : "—"}
                {" – "}
                {item.remediationCostHighCents !== null
                  ? `$${(item.remediationCostHighCents / 100).toLocaleString()}`
                  : "—"}
              </span>
            </div>
          )}
          {item.notes && (
            <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-1.5 text-xs">
              {item.notes}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              title="Edit"
            >
              <Pencil className="size-3.5" />
            </Button>
            <DeleteButton surveyId={surveyId} itemId={item.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function formatDetails(item: InventoryItem): string {
  const d = item.details ?? {};
  const parts: string[] = [];
  // Common compute specs
  if (typeof d.os === "string" || typeof d.osVersion === "string") {
    parts.push(`OS: ${[d.os, d.osVersion].filter(Boolean).join(" ")}`);
  }
  if (typeof d.cpu === "string") parts.push(`CPU: ${d.cpu}`);
  if (typeof d.ramGb === "number") parts.push(`RAM: ${d.ramGb} GB`);
  if (typeof d.storageGb === "number") parts.push(`Storage: ${d.storageGb} GB`);
  // Monitor
  if (typeof d.sizeInches === "number") parts.push(`${d.sizeInches}"`);
  if (typeof d.resolution === "string") parts.push(d.resolution);
  // Network gear
  if (typeof d.ports === "number") parts.push(`${d.ports} ports`);
  if (typeof d.poeWatts === "number") parts.push(`${d.poeWatts}W PoE`);
  if (typeof d.wifiStandard === "string") parts.push(d.wifiStandard);
  // UPS / power
  if (typeof d.capacityVA === "number") parts.push(`${d.capacityVA} VA`);
  // Print
  if (typeof d.ppm === "number") parts.push(`${d.ppm} ppm`);
  if (typeof d.color === "boolean") parts.push(d.color ? "color" : "B&W");
  // Peripherals
  if (typeof d.wireless === "boolean") parts.push(d.wireless ? "wireless" : "wired");
  return parts.join("  ·  ");
}

function DeleteButton({
  surveyId,
  itemId,
}: {
  surveyId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        if (!confirm("Delete this item?")) return;
        start(async () => {
          const r = await deleteSurveyItem({ surveyId, itemId });
          if (r?.serverError) {
            toast.error(r.serverError);
            return;
          }
          toast.success("Deleted");
          router.refresh();
        });
      }}
      disabled={pending}
      className="text-destructive hover:text-destructive"
      title="Delete"
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

function NewItemForm({
  surveyId,
  groupKinds,
  onClose,
}: {
  surveyId: string;
  groupKinds: string[];
  onClose: () => void;
}) {
  return (
    <ItemForm
      surveyId={surveyId}
      onClose={onClose}
      kindOptions={groupKinds}
    />
  );
}

/* ============================================================================
 * ItemForm — used for both create + edit.
 * ========================================================================== */
function ItemForm({
  surveyId,
  item,
  onClose,
  kindOptions,
}: {
  surveyId: string;
  item?: InventoryItem;
  onClose: () => void;
  /** When set, the kind dropdown is restricted to these kinds. */
  kindOptions?: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState(
    item?.kind ?? (kindOptions ? kindOptions[0] : "workstation"),
  );
  const [label, setLabel] = useState(item?.label ?? "");
  const [assetTag, setAssetTag] = useState(item?.assetTag ?? "");
  const [hostname, setHostname] = useState(item?.hostname ?? "");
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber ?? "");
  const [make, setMake] = useState(item?.make ?? "");
  const [model, setModel] = useState(item?.model ?? "");
  const [room, setRoom] = useState(item?.room ?? "");
  const [userAssigned, setUserAssigned] = useState(item?.userAssigned ?? "");
  const [details, setDetails] = useState(
    JSON.stringify(item?.details ?? {}, null, 2),
  );
  const [installDate, setInstallDate] = useState(
    typeof item?.installDate === "string"
      ? item.installDate
      : item?.installDate
        ? new Date(item.installDate).toISOString().slice(0, 10)
        : "",
  );
  const [warrantyEnd, setWarrantyEnd] = useState(
    typeof item?.warrantyEnd === "string"
      ? item.warrantyEnd
      : item?.warrantyEnd
        ? new Date(item.warrantyEnd).toISOString().slice(0, 10)
        : "",
  );
  const [condition, setCondition] = useState(item?.condition ?? "unknown");
  const [recommendedAction, setRecommendedAction] = useState(
    item?.recommendedAction ?? "unknown",
  );
  const [remediationCostLow, setRemediationCostLow] = useState(
    item?.remediationCostLowCents !== null &&
      item?.remediationCostLowCents !== undefined
      ? String(item.remediationCostLowCents / 100)
      : "",
  );
  const [remediationCostHigh, setRemediationCostHigh] = useState(
    item?.remediationCostHighCents !== null &&
      item?.remediationCostHighCents !== undefined
      ? String(item.remediationCostHighCents / 100)
      : "",
  );
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));

  const submit = () => {
    if (label.trim().length < 1) {
      toast.error("Label is required");
      return;
    }
    let detailsObj: Record<string, unknown> = {};
    if (details.trim().length > 0) {
      try {
        const parsed = JSON.parse(details);
        if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) {
          detailsObj = parsed as Record<string, unknown>;
        } else {
          toast.error("Details must be a JSON object");
          return;
        }
      } catch {
        toast.error(
          "Details JSON is invalid — fix it or clear it.",
        );
        return;
      }
    }
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty < 1) {
      toast.error("Quantity must be 1 or more");
      return;
    }
    const lowCents = remediationCostLow
      ? Math.round(Number(remediationCostLow) * 100)
      : null;
    const highCents = remediationCostHigh
      ? Math.round(Number(remediationCostHigh) * 100)
      : null;

    start(async () => {
      const payload = {
        surveyId,
        kind: kind as Parameters<typeof addSurveyItem>[0]["kind"],
        label,
        assetTag: assetTag || null,
        hostname: hostname || null,
        serialNumber: serialNumber || null,
        make: make || null,
        model: model || null,
        room: room || null,
        userAssigned: userAssigned || null,
        details: detailsObj,
        installDate: installDate || null,
        warrantyEnd: warrantyEnd || null,
        condition: condition as Parameters<
          typeof addSurveyItem
        >[0]["condition"],
        recommendedAction: recommendedAction as Parameters<
          typeof addSurveyItem
        >[0]["recommendedAction"],
        remediationCostLowCents: lowCents,
        remediationCostHighCents: highCents,
        notes: notes || null,
        quantity: qty,
      };
      if (item) {
        const r = await updateSurveyItem({ itemId: item.id, ...payload });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Saved");
      } else {
        const r = await addSurveyItem(payload);
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Added");
      }
      onClose();
      router.refresh();
    });
  };

  const allKinds = Object.keys(ITEM_KIND_LABEL);
  const kindList = kindOptions ?? allKinds;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[14rem_1fr_5rem]">
        <div>
          <Label className="text-xs">Kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {kindList.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABEL[k] ?? k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='"Reception laptop", "MDF rack switch", "Front desk monitor"'
            autoFocus
          />
        </div>
        <div>
          <Label className="text-xs">Quantity</Label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Make</Label>
          <Input value={make} onChange={(e) => setMake(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Model</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Asset tag</Label>
          <Input
            value={assetTag}
            onChange={(e) => setAssetTag(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Hostname</Label>
          <Input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Serial number</Label>
          <Input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Room / location</Label>
          <Input value={room} onChange={(e) => setRoom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">User assigned</Label>
          <Input
            value={userAssigned}
            onChange={(e) => setUserAssigned(e.target.value)}
            placeholder="Sarah Smith"
          />
        </div>
        <div>
          <Label className="text-xs">Install date</Label>
          <Input
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Warranty end</Label>
          <Input
            type="date"
            value={warrantyEnd}
            onChange={(e) => setWarrantyEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Condition</Label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="unknown">Unknown</option>
            <option value="new">New</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="aging">Aging</option>
            <option value="eol">End of life</option>
            <option value="dead">Dead / non-functional</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Recommended action</Label>
          <select
            value={recommendedAction}
            onChange={(e) => setRecommendedAction(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="unknown">TBD</option>
            <option value="keep">Keep</option>
            <option value="monitor">Monitor</option>
            <option value="refresh_planned">Refresh — planned</option>
            <option value="refresh_now">Refresh — now</option>
            <option value="replace">Replace</option>
            <option value="decommission">Decommission</option>
            <option value="investigate">Investigate</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Remediation cost (low, $)</Label>
          <Input
            type="number"
            step="1"
            value={remediationCostLow}
            onChange={(e) => setRemediationCostLow(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Remediation cost (high, $)</Label>
          <Input
            type="number"
            step="1"
            value={remediationCostHigh}
            onChange={(e) => setRemediationCostHigh(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">
          Spec details (JSON)
        </Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Kind-specific fields. Examples:{" "}
          <code>
            {"{ os, osVersion, cpu, ramGb, storageGb, monitorCount }"}
          </code>{" "}
          for workstations;{" "}
          <code>{"{ ports, poeWatts, wifiStandard }"}</code> for switches /
          APs; <code>{'{ sizeInches: 27, resolution: "2560x1440" }'}</code>{" "}
          for monitors.
        </p>
        <Textarea
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="font-mono text-xs"
          placeholder="{}"
        />
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 border-t pt-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : item ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
