"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Download,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { TopologyGraph, TopologyLink, TopologyNode } from "@/db/schema/discovery";
import {
  deleteTopology,
  pushTopologyToInventory,
  refineTopology,
  retryTopology,
  saveTopology,
} from "@/server/actions/discovery-topology";
import { cn } from "@/lib/utils";
import { ChoiceChips, INPUT_CLS, TEXTAREA_CLS } from "./field-inputs";
import { useDiscoveryProject } from "./project-context";
import { TopologySvg } from "./topology-svg";

const NODE_TYPES = ["internet", "modem", "firewall", "router", "switch", "ap", "server", "nas", "nvr", "camera", "printer", "workstation", "phone", "iot", "cloud", "other"];
const MEDIA = ["copper", "fiber", "wireless", "vpn", "unknown"];
const PUSHABLE = new Set(["switch", "ap", "server", "nas", "camera", "printer"]);

export function TopologyEditor({
  topologyId,
  title: initialTitle,
  status,
  error,
  graph: initialGraph,
  sources,
}: {
  topologyId: string;
  title: string;
  status: string;
  error: string | null;
  graph: TopologyGraph | null;
  sources: Array<{ id: string; url: string }>;
}) {
  const router = useRouter();
  const { projectId, canEdit } = useDiscoveryProject();
  const [graph, setGraph] = useState<TopologyGraph | null>(initialGraph);
  const [title, setTitle] = useState(initialTitle);
  const [dirty, setDirty] = useState(false);
  const [scale, setScale] = useState(1);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<null | "refine" | "push" | "save" | "retry">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Server re-render (after refine/push) replaces local state if not dirty.
  const [seen, setSeen] = useState(initialGraph);
  if (initialGraph !== seen) {
    setSeen(initialGraph);
    if (!dirty) setGraph(initialGraph);
  }

  const mutate = (fn: (g: TopologyGraph) => TopologyGraph) => {
    setGraph((g) => (g ? fn(g) : g));
    setDirty(true);
  };

  const pushable = useMemo(() => graph?.nodes.filter((n) => PUSHABLE.has(n.type) && !n.recordId).length ?? 0, [graph]);

  const run = (kind: NonNullable<typeof busy>, fn: () => Promise<{ serverError?: string } | undefined>, ok?: string) => {
    setBusy(kind);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (r?.serverError) return void toast.error(r.serverError);
      if (ok) toast.success(ok);
      router.refresh();
    });
  };

  const save = () =>
    run(
      "save",
      async () => {
        const r = await saveTopology({ topologyId, title, graph: graph ?? undefined });
        if (!r?.serverError) setDirty(false);
        return r;
      },
      "Saved",
    );

  const downloadSvg = () => {
    const el = document.getElementById(`topo-${topologyId}`);
    if (!el) return;
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "topology"}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const node = graph?.nodes.find((n) => n.id === nodeId) ?? null;
  const link = graph?.links.find((l) => l.id === linkId) ?? null;
  const nodeLabel = (id: string) => graph?.nodes.find((n) => n.id === id)?.label ?? id;

  if (status === "extracting" || !graph) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        {status === "extracting" ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <p className="text-[15px] font-medium">Reading the diagram…</p>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto size-8 text-amber-500" />
            <p className="text-[15px] font-medium">{error ?? "Extraction didn't finish."}</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => run("retry", () => retryTopology({ topologyId }))}
                disabled={pending}
                className="mx-auto flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                {busy === "retry" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Try again
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }}
        disabled={!canEdit}
        className="w-full bg-transparent text-2xl font-semibold tracking-tight focus:outline-none"
        aria-label="Topology title"
      />

      {error && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">{error}</p>}

      {/* Diagram */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
          <button type="button" onClick={() => setScale((s) => Math.max(0.4, s - 0.2))} className="flex size-9 items-center justify-center rounded-full active:bg-accent" aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale((s) => Math.min(2.5, s + 0.2))} className="flex size-9 items-center justify-center rounded-full active:bg-accent" aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
          <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">Tap a device to edit</span>
          <button type="button" onClick={downloadSvg} className="ml-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium active:bg-accent">
            <Download className="size-4" /> SVG
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto bg-white">
          <TopologySvg graph={graph} scale={scale} selectedId={nodeId} svgId={`topo-${topologyId}`} onSelect={canEdit ? setNodeId : undefined} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span><span className="mr-1 inline-block h-0.5 w-5 bg-amber-500 align-middle" />Fiber</span>
          <span><span className="mr-1 inline-block h-0.5 w-5 bg-slate-500 align-middle" />Copper</span>
          <span><span className="mr-1 inline-block w-5 border-t-2 border-dashed border-violet-600 align-middle" />Wireless</span>
          <span><span className="mr-1 inline-block w-5 border-t-2 border-dotted border-cyan-600 align-middle" />VPN</span>
          <span><span className="mr-1 inline-block size-3 rounded border-2 border-dashed border-red-500 align-middle" />Low confidence</span>
        </div>
      </div>

      {graph.summary && <p className="text-[15px] leading-relaxed">{graph.summary}</p>}

      {graph.uncertainties.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <AlertTriangle className="size-4 text-amber-500" /> Verify on site ({graph.uncertainties.length - checked.size} left)
          </h2>
          <ul className="space-y-1">
            {graph.uncertainties.map((u, i) => (
              <li key={i}>
                <label className="flex min-h-10 items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0"
                    checked={checked.has(i)}
                    onChange={() => setChecked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                  />
                  <span className={cn(checked.has(i) && "text-muted-foreground line-through")}>{u}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Refine with Claude */}
      {canEdit && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles className="size-4 text-violet-500" /> Fix something
          </h2>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="e.g. “The box labelled SW2 is a 48-port PoE switch in IDF-2, and AP-Warehouse connects to SW2 not SW1”"
            className={cn(TEXTAREA_CLS, "min-h-[72px]")}
          />
          <button
            type="button"
            disabled={pending || correction.trim().length < 3 || dirty}
            onClick={() =>
              run("refine", async () => {
                const r = await refineTopology({ topologyId, correction });
                if (!r?.serverError) setCorrection("");
                return r;
              }, "Topology updated")
            }
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "refine" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {dirty ? "Save your edits first" : busy === "refine" ? "Re-reading with your correction…" : "Apply correction"}
          </button>
        </section>
      )}

      {/* Devices */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Devices ({graph.nodes.length})</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                const id = `n-${crypto.randomUUID().slice(0, 6)}`;
                mutate((g) => ({ ...g, nodes: [...g.nodes, { id, label: "New device", type: "switch", confidence: "high" }] }));
                setNodeId(id);
              }}
              className="flex h-9 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium"
            >
              <Plus className="size-4" /> Device
            </button>
          )}
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {graph.nodes.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => canEdit && setNodeId(n.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-accent">
                <span className="w-20 shrink-0 text-[11px] font-semibold uppercase text-muted-foreground">{n.type}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">
                    {n.label} {n.recordId && <span className="text-xs text-emerald-600">✓ in inventory</span>}
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {[n.ip, [n.make, n.model].filter(Boolean).join(" "), n.location].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                {n.confidence === "low" && <AlertTriangle className="size-4 shrink-0 text-red-500" aria-label="Low confidence" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Connections */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Connections ({graph.links.length})</h2>
          {canEdit && graph.nodes.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                const id = `l-${crypto.randomUUID().slice(0, 6)}`;
                mutate((g) => ({ ...g, links: [...g.links, { id, from: g.nodes[0].id, to: g.nodes[1].id, medium: "copper", confidence: "high" }] }));
                setLinkId(id);
              }}
              className="flex h-9 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium"
            >
              <Plus className="size-4" /> Connection
            </button>
          )}
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {graph.links.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => canEdit && setLinkId(l.id)} className="w-full px-4 py-3 text-left active:bg-accent">
                <span className="block truncate text-[15px] font-medium">
                  {nodeLabel(l.from)} → {nodeLabel(l.to)}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {[l.medium, l.speed, l.fromPort && `port ${l.fromPort}`, l.toPort && `→ ${l.toPort}`, l.label].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {graph.vlans.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[17px] font-semibold">VLANs / subnets</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
            {graph.vlans.map((v, i) => (
              <li key={i} className="px-4 py-2.5">
                <span className="font-medium">VLAN {v.id}</span> {v.name && `· ${v.name}`} {v.subnet && <span className="font-mono text-muted-foreground">· {v.subnet}</span>}
                {v.notes && <p className="text-muted-foreground">{v.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[17px] font-semibold">Source images</h2>
          <div className="flex gap-2 overflow-x-auto">
            {sources.map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="block size-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt="Source" className="size-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}

      {canEdit && (
        <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={pending || pushable === 0 || dirty}
            onClick={() =>
              run("push", async () => {
                const r = await pushTopologyToInventory({ topologyId });
                if (r?.data) toast.success(`Added ${r.data.created} device${r.data.created === 1 ? "" : "s"} to the walk's inventory`);
                return r;
              })
            }
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-[15px] font-medium disabled:opacity-50"
          >
            {busy === "push" ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
            {pushable ? `Add ${pushable} devices to inventory` : "All devices in inventory"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              start(async () => {
                const r = await deleteTopology({ topologyId });
                if (r?.serverError) return void toast.error(r.serverError);
                router.push(`/discovery/${projectId}/topology`);
              });
            }}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-medium",
              confirmDelete ? "bg-destructive text-destructive-foreground" : "border border-border text-destructive",
            )}
          >
            <Trash2 className="size-4" /> {confirmDelete ? "Tap to confirm delete" : "Delete topology"}
          </button>
        </div>
      )}

      {/* Save bar */}
      {dirty && canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-2 backdrop-blur md:left-56" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-3xl gap-2">
            <button
              type="button"
              onClick={() => {
                setGraph(initialGraph);
                setTitle(initialTitle);
                setDirty(false);
              }}
              className="h-12 flex-1 rounded-xl border border-border text-[15px] font-medium"
            >
              Discard
            </button>
            <button type="button" onClick={save} disabled={pending} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground">
              {busy === "save" && <Loader2 className="size-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}

      {node && (
        <Sheet title={node.label || "Device"} onClose={() => setNodeId(null)}>
          <NodeForm
            node={node}
            links={graph.links.filter((l) => l.from === node.id || l.to === node.id)}
            nodeLabel={nodeLabel}
            onChange={(next) => mutate((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === node.id ? next : n)) }))}
            onDeleteLink={(id) => mutate((g) => ({ ...g, links: g.links.filter((l) => l.id !== id) }))}
            onDelete={() => {
              mutate((g) => ({
                ...g,
                nodes: g.nodes.filter((n) => n.id !== node.id),
                links: g.links.filter((l) => l.from !== node.id && l.to !== node.id),
              }));
              setNodeId(null);
            }}
          />
        </Sheet>
      )}
      {link && (
        <Sheet title="Connection" onClose={() => setLinkId(null)}>
          <LinkForm
            link={link}
            nodes={graph.nodes}
            onChange={(next) => mutate((g) => ({ ...g, links: g.links.map((l) => (l.id === link.id ? next : l)) }))}
            onDelete={() => {
              mutate((g) => ({ ...g, links: g.links.filter((l) => l.id !== link.id) }));
              setLinkId(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-background" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }} role="dialog" aria-modal="true">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-full active:bg-accent" aria-label="Close">
          <X className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</p>
        <button type="button" onClick={onClose} className="h-10 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground">
          Done
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="mx-auto max-w-xl space-y-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

function NodeForm({
  node,
  links,
  nodeLabel,
  onChange,
  onDeleteLink,
  onDelete,
}: {
  node: TopologyNode;
  links: TopologyLink[];
  nodeLabel: (id: string) => string;
  onChange: (n: TopologyNode) => void;
  onDeleteLink: (id: string) => void;
  onDelete: () => void;
}) {
  const set = (k: keyof TopologyNode) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...node, [k]: e.target.value || null });
  return (
    <>
      <Field label="Name / label"><input value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })} className={INPUT_CLS} /></Field>
      <Field label="Type">
        <ChoiceChips size="sm" options={NODE_TYPES} value={node.type} onChange={(v) => v && onChange({ ...node, type: v as string })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make"><input value={node.make ?? ""} onChange={set("make")} className={INPUT_CLS} /></Field>
        <Field label="Model"><input value={node.model ?? ""} onChange={set("model")} className={INPUT_CLS} /></Field>
        <Field label="IP"><input value={node.ip ?? ""} onChange={set("ip")} inputMode="decimal" className={INPUT_CLS} /></Field>
        <Field label="MAC"><input value={node.mac ?? ""} onChange={set("mac")} autoCapitalize="characters" className={INPUT_CLS} /></Field>
      </div>
      <Field label="Location"><input value={node.location ?? ""} onChange={set("location")} placeholder="MDF, IDF-2, Rm 214…" className={INPUT_CLS} /></Field>
      <Field label="Notes"><textarea value={node.notes ?? ""} onChange={set("notes")} className={TEXTAREA_CLS} /></Field>
      <Field label="Confidence">
        <ChoiceChips size="sm" options={["high", "medium", "low"]} value={node.confidence ?? "high"} onChange={(v) => v && onChange({ ...node, confidence: v as TopologyNode["confidence"] })} />
      </Field>
      {links.length > 0 && (
        <Field label="Connections">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {nodeLabel(l.from === node.id ? l.to : l.from)} · {l.medium ?? "unknown"}
                  {l.speed ? ` · ${l.speed}` : ""}
                </span>
                <button type="button" onClick={() => onDeleteLink(l.id)} className="flex size-9 items-center justify-center rounded-full text-destructive active:bg-accent" aria-label="Remove connection">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}
      <button type="button" onClick={onDelete} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-[15px] font-medium text-destructive">
        <Trash2 className="size-4" /> Remove device
      </button>
    </>
  );
}

function LinkForm({
  link,
  nodes,
  onChange,
  onDelete,
}: {
  link: TopologyLink;
  nodes: TopologyNode[];
  onChange: (l: TopologyLink) => void;
  onDelete: () => void;
}) {
  const select = `${INPUT_CLS} appearance-none`;
  const set = (k: keyof TopologyLink) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...link, [k]: e.target.value || null });
  return (
    <>
      <Field label="From">
        <select value={link.from} onChange={(e) => onChange({ ...link, from: e.target.value })} className={select}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
      </Field>
      <Field label="To">
        <select value={link.to} onChange={(e) => onChange({ ...link, to: e.target.value })} className={select}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
      </Field>
      <Field label="Medium">
        <ChoiceChips size="sm" options={MEDIA} value={link.medium ?? "unknown"} onChange={(v) => v && onChange({ ...link, medium: v as string })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Speed"><input value={link.speed ?? ""} onChange={set("speed")} placeholder="1G, 10G…" className={INPUT_CLS} /></Field>
        <Field label="Label"><input value={link.label ?? ""} onChange={set("label")} placeholder="~180 ft via tray" className={INPUT_CLS} /></Field>
        <Field label="From port"><input value={link.fromPort ?? ""} onChange={set("fromPort")} className={INPUT_CLS} /></Field>
        <Field label="To port"><input value={link.toPort ?? ""} onChange={set("toPort")} className={INPUT_CLS} /></Field>
      </div>
      <button type="button" onClick={onDelete} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-[15px] font-medium text-destructive">
        <Trash2 className="size-4" /> Remove connection
      </button>
    </>
  );
}
