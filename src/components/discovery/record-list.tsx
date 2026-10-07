"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronRight, Copy, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { imageFiles, useFinePointer } from "@/lib/discovery/client/input-mode";
import { recordSubtitle, recordTitle } from "@/lib/discovery/templates";
import type { TableDef } from "@/lib/discovery/types";
import { cn } from "@/lib/utils";
import { CameraSheet } from "./camera-sheet";
import { ColumnInput } from "./field-inputs";
import { useOutbox } from "./outbox-provider";
import { PhotoStrip, useTargetPhotos } from "./photo-strip";
import { useDiscoveryProject, type ServerPhoto } from "./project-context";

export type RecordRow = {
  id: string;
  data: Record<string, string>;
  sortOrder: number;
};

const KEEP_STYLE: Record<string, string> = {
  Keep: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "Reuse-reconfig": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Replace: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Decommission: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  "Needs-eval": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Blocker: "bg-rose-600 text-white",
  High: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function RecordCard({
  table,
  row,
  photos,
  onOpen,
}: {
  table: TableDef;
  row: RecordRow;
  photos: ServerPhoto[];
  onOpen: () => void;
}) {
  const merged = useTargetPhotos({ recordId: row.id }, photos);
  const badge = row.data.keep || row.data.level;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm active:scale-[0.99] transition"
    >
      {merged[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={merged[0].url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Camera className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{recordTitle(table, row.data)}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{recordSubtitle(table, row.data) || "Tap to fill in"}</span>
        <span className="mt-1 flex items-center gap-1.5">
          {badge && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", KEEP_STYLE[badge] ?? "bg-muted")}>{badge}</span>}
          {merged.length > 0 && <span className="text-[11px] text-muted-foreground">{merged.length} photo{merged.length === 1 ? "" : "s"}</span>}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function RecordList({
  table,
  sectionKey,
  serverRows,
  photos,
  openRecordId,
}: {
  table: TableDef;
  sectionKey: string;
  serverRows: RecordRow[];
  photos: ServerPhoto[];
  openRecordId?: string;
}) {
  const { projectId, pathPrefix, canEdit } = useDiscoveryProject();
  const outbox = useOutbox();
  const [openId, setOpenId] = useState<string | null>(openRecordId ?? null);
  const [cameraFor, setCameraFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<Record<string, RecordRow>>({});
  const fine = useFinePointer();
  const uploadRef = useRef<HTMLInputElement>(null);

  // Server rows overlaid with queued edits, minus deletions.
  const rows = useMemo(() => {
    const byId = new Map<string, RecordRow>(serverRows.map((r) => [r.id, r]));
    for (const p of outbox.pendingRecords(projectId, table.key)) {
      byId.set(p.recordId, { id: p.recordId, data: p.data, sortOrder: p.sortOrder ?? byId.get(p.recordId)?.sortOrder ?? 0 });
    }
    for (const r of Object.values(local)) byId.set(r.id, r);
    return [...byId.values()]
      .filter((r) => !outbox.isRecordDeleted(r.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [serverRows, outbox, projectId, table.key, local]);

  const filtered = query.trim()
    ? rows.filter((r) => Object.values(r.data).join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    : rows;

  const create = (data: Record<string, string>, withCamera = false) => {
    const id = crypto.randomUUID();
    const sortOrder = Math.floor(Date.now() / 1000);
    setLocal((prev) => ({ ...prev, [id]: { id, data, sortOrder } }));
    outbox.saveRecord({ projectId, recordId: id, tableKey: table.key, data, sortOrder });
    if (withCamera) setCameraFor(id);
    else setOpenId(id);
    return id;
  };

  const update = (id: string, data: Record<string, string>) => {
    const sortOrder = rows.find((r) => r.id === id)?.sortOrder ?? Math.floor(Date.now() / 1000);
    setLocal((prev) => ({ ...prev, [id]: { id, data, sortOrder } }));
    outbox.saveRecord({ projectId, recordId: id, tableKey: table.key, data, sortOrder });
  };

  const usedPresets = new Set(rows.map((r) => r.data[table.titleKeys[0]]));
  const openRow = rows.find((r) => r.id === openId) ?? null;
  const cameraRow = rows.find((r) => r.id === cameraFor) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 max-sm:flex-wrap">
        <h3 className="text-[17px] font-semibold">
          {table.title} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </h3>
      </div>
      {table.intro && <p className="text-[13px] text-muted-foreground">{table.intro}</p>}

      {rows.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${table.title.toLowerCase()}`}
            type="search"
            className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-base"
          />
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((row) => (
          <RecordCard key={row.id} table={table} row={row} photos={photos.filter((p) => p.recordId === row.id)} onOpen={() => setOpenId(row.id)} />
        ))}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No {table.title.toLowerCase()} recorded yet.
          </p>
        )}
      </div>

      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => create({})}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground active:scale-[0.98]"
          >
            <Plus className="size-5" /> Add {table.singular.toLowerCase()}
          </button>
          <button
            type="button"
            onClick={() => (fine ? uploadRef.current?.click() : create({}, true))}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background text-[15px] font-semibold active:scale-[0.98]"
          >
            {fine ? <Upload className="size-5" /> : <Camera className="size-5" />} {fine ? "Upload first" : "Snap first"}
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = imageFiles(e.target.files);
              e.target.value = "";
              if (!files.length) return;
              const id = create({});
              void outbox.addPhotos(files, { recordId: id, sectionKey }, { projectId, pathPrefix });
            }}
          />
        </div>
      )}

      {canEdit && table.presets && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick add</p>
          <div className="flex flex-wrap gap-2">
            {table.presets
              .filter((p) => !usedPresets.has(p))
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => create({ [table.titleKeys[0]]: p })}
                  className="flex min-h-9 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm active:bg-accent"
                >
                  <Plus className="size-3.5" /> {p}
                </button>
              ))}
          </div>
        </div>
      )}

      {openRow && (
        <RecordEditor
          table={table}
          sectionKey={sectionKey}
          row={openRow}
          photos={photos.filter((p) => p.recordId === openRow.id)}
          onChange={(data) => update(openRow.id, data)}
          onDuplicate={() => {
            const copy = Object.fromEntries(
              Object.entries(openRow.data).filter(([k]) => !["serial", "user", "hostname", "mgmt_ip", "notes"].includes(k)),
            );
            create(copy);
          }}
          onDelete={() => {
            outbox.removeRecord(projectId, openRow.id);
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* "Snap first": photo before details — common for nameplates and racks. */}
      <CameraSheet
        open={!!cameraRow}
        title={`New ${table.singular.toLowerCase()}`}
        subtitle="Shoot the nameplate / label — fill in details next"
        onCapture={(blobs) =>
          cameraRow && void outbox.addPhotos(blobs, { recordId: cameraRow.id, sectionKey }, { projectId, pathPrefix })
        }
        onClose={() => {
          const id = cameraFor;
          setCameraFor(null);
          if (id) setOpenId(id);
        }}
      />
    </div>
  );
}

function RecordEditor({
  table,
  sectionKey,
  row,
  photos,
  onChange,
  onDuplicate,
  onDelete,
  onClose,
}: {
  table: TableDef;
  sectionKey: string;
  row: RecordRow;
  photos: ServerPhoto[];
  onChange: (data: Record<string, string>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { canEdit } = useDiscoveryProject();
  const [data, setData] = useState(row.data);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(data);
  latest.current = data;

  useEffect(() => {
    setData(row.data);
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      if (timer.current) {
        clearTimeout(timer.current);
        onChange(latest.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: string, value: string, immediate: boolean) => {
    const next = { ...latest.current, [key]: value };
    setData(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        timer.current = null;
        onChange(latest.current);
      },
      immediate ? 0 : 600,
    );
  };

  const close = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      onChange(latest.current);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-background"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" onClick={close} className="flex size-11 items-center justify-center rounded-full active:bg-accent" aria-label="Close">
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{recordTitle(table, data)}</p>
          <p className="truncate text-xs text-muted-foreground">{table.singular}</p>
        </div>
        <button type="button" onClick={close} className="h-10 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground">
          Done
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="mx-auto max-w-xl space-y-5">
          <PhotoStrip target={{ recordId: row.id, sectionKey }} serverPhotos={photos} title={recordTitle(table, data)} />

          <fieldset disabled={!canEdit} className="space-y-5">
            {table.columns.map((col) => {
              const immediate = ["choice", "multi", "yn", "date"].includes(col.type);
              return (
                <div key={col.key}>
                  <label className="mb-1.5 block text-sm font-medium">
                    {col.label}
                    {col.hint && <span className="ml-1 font-normal text-muted-foreground">· {col.hint}</span>}
                  </label>
                  <ColumnInput
                    field={col}
                    value={data[col.key] ?? ""}
                    onChange={(v) => set(col.key, v, immediate)}
                    placeholder={table.example?.[col.key] ? `e.g. ${table.example[col.key]}` : undefined}
                  />
                </div>
              );
            })}
          </fieldset>

          {canEdit && (
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  close();
                  onDuplicate();
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-[15px] font-medium active:bg-accent"
              >
                <Copy className="size-4" /> Duplicate
              </button>
              <button
                type="button"
                onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
                className={cn(
                  "flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-medium",
                  confirmDelete ? "bg-destructive text-destructive-foreground" : "border border-border text-destructive active:bg-accent",
                )}
              >
                <Trash2 className="size-4" /> {confirmDelete ? "Tap to confirm" : "Delete"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
