"use client";

/**
 * Offline-first sync engine for discovery capture.
 *
 * Writes go to an IndexedDB outbox first and replay in order (FIFO by
 * seq) against the server actions. Repeated edits to the same answer or
 * record collapse into the queued op in place, so ordering guarantees
 * like "record exists before its photos register" hold.
 *
 * Failure policy: thrown errors (offline, flaky network, redirects) are
 * transient — retried with backoff, never dropped. A structured server
 * error counts an attempt; after MAX_ATTEMPTS the op is dropped and
 * surfaced. Auth errors pause the queue until the user signs back in.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import {
  deleteDiscoveryRecord,
  registerDiscoveryPhoto,
  saveDiscoveryAnswer,
  upsertDiscoveryRecord,
} from "@/server/actions/discovery";
import { processImage } from "@/lib/discovery/client/image";
import {
  deleteOp,
  isIdbAvailable,
  loadAll,
  nextSeq,
  putOp,
  type AnswerPayload,
  type OutboxOp,
  type PhotoTarget,
  type RecordPayload,
} from "@/lib/discovery/client/outbox-store";

const MAX_ATTEMPTS = 4;

export type LocalPhoto = {
  photoId: string;
  url: string;
  status: "queued" | "uploading" | "done";
  target: PhotoTarget;
  takenAt: string;
};

type OutboxContext = {
  ready: boolean;
  online: boolean;
  syncing: boolean;
  authPaused: boolean;
  pendingCount: number;
  pendingPhotoCount: number;
  isPending: (key: string) => boolean;
  pendingAnswer: (projectId: string, questionKey: string) => AnswerPayload | undefined;
  pendingRecords: (projectId: string, tableKey: string) => RecordPayload[];
  isRecordDeleted: (recordId: string) => boolean;
  saveAnswer: (p: Omit<AnswerPayload, "clientUpdatedAt">) => void;
  saveRecord: (p: Omit<RecordPayload, "clientUpdatedAt">) => void;
  removeRecord: (projectId: string, recordId: string) => void;
  addPhotos: (
    files: Blob[],
    target: PhotoTarget,
    meta: { projectId: string; pathPrefix: string },
  ) => Promise<void>;
  localPhotos: (match: (t: PhotoTarget) => boolean) => LocalPhoto[];
  forgetLocalPhotos: (photoIds: string[]) => void;
  flush: () => void;
};

const Ctx = createContext<OutboxContext | null>(null);

export function useOutbox() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOutbox must be used inside DiscoveryOutboxProvider");
  return ctx;
}

function isAuthError(msg: string) {
  return /not signed in|unauthenticated|sign in/i.test(msg);
}

export function DiscoveryOutboxProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const opsRef = useRef<OutboxOp[]>([]);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [authPaused, setAuthPaused] = useState(false);
  const [photos, setPhotos] = useState<Record<string, LocalPhoto>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const persist = useRef(true);
  const running = useRef(false);
  const inflight = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(2_000);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: OutboxOp[]) => {
    opsRef.current = next;
    setOps(next);
  }, []);

  const save = useCallback(async (op: OutboxOp) => {
    if (!persist.current) return;
    try {
      await putOp(op);
    } catch {
      persist.current = false; // storage full / private mode — keep in memory
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    if (!persist.current) return;
    try {
      await deleteOp(id);
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 900);
  }, [router]);

  const setPhotoStatus = useCallback((photoId: string, status: LocalPhoto["status"]) => {
    setPhotos((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], status } } : prev));
  }, []);

  /** Executes one op. Returns "ok" | "transient" | "failed" | "auth". */
  const execute = useCallback(
    async (op: OutboxOp): Promise<{ result: "ok" | "transient" | "failed" | "auth"; message?: string }> => {
      try {
        let serverError: string | undefined;
        if (op.kind === "answer") {
          const r = await saveDiscoveryAnswer(op.payload as Parameters<typeof saveDiscoveryAnswer>[0]);
          serverError = r?.serverError ?? (r?.validationErrors ? "Invalid answer" : undefined);
        } else if (op.kind === "record") {
          const r = await upsertDiscoveryRecord(op.payload);
          serverError = r?.serverError ?? (r?.validationErrors ? "Invalid record" : undefined);
        } else if (op.kind === "record_delete") {
          const r = await deleteDiscoveryRecord(op.payload);
          serverError = r?.serverError;
        } else {
          const p = op.payload;
          if (!p.uploaded) {
            setPhotoStatus(p.photoId, "uploading");
            const ext = p.mimeType === "image/png" ? "png" : p.mimeType.startsWith("image/heic") ? "heic" : "jpg";
            const res = await upload(`${p.pathPrefix}${p.photoId}.${ext}`, op.blob, {
              access: "private",
              handleUploadUrl: "/api/discovery/upload",
              clientPayload: JSON.stringify({ projectId: p.projectId }),
              contentType: p.mimeType,
            });
            p.uploaded = { url: res.url, pathname: res.pathname };
            await save(op); // don't re-upload if registration fails
          }
          const r = await registerDiscoveryPhoto({
            projectId: p.projectId,
            photoId: p.photoId,
            url: p.uploaded.url,
            pathname: p.uploaded.pathname,
            questionKey: p.questionKey ?? null,
            recordId: p.recordId ?? null,
            sectionKey: p.sectionKey ?? null,
            mimeType: p.mimeType,
            sizeBytes: p.sizeBytes,
            widthPx: p.widthPx,
            heightPx: p.heightPx,
            caption: p.caption ?? null,
            takenAt: p.takenAt,
          });
          serverError = r?.serverError ?? (r?.validationErrors ? "Invalid photo" : undefined);
        }
        if (!serverError) return { result: "ok" };
        if (isAuthError(serverError)) return { result: "auth", message: serverError };
        return { result: "failed", message: serverError };
      } catch (err) {
        // Blob token refusals come back as thrown errors with a message
        // from our route; treat an online, non-network failure as a
        // structured failure so it can't spin forever.
        const msg = err instanceof Error ? err.message : String(err);
        if (typeof navigator !== "undefined" && navigator.onLine && /not allowed|not found|invalid|configured/i.test(msg)) {
          return { result: "failed", message: msg };
        }
        return { result: "transient", message: msg };
      }
    },
    [save, setPhotoStatus],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    running.current = true;
    setSyncing(true);
    let didWork = false;
    try {
      while (opsRef.current.length) {
        const op = opsRef.current[0];
        inflight.current = op.id;
        const { result, message } = await execute(op);
        inflight.current = null;
        if (result === "ok" || result === "failed") {
          if (result === "failed") {
            op.attempts += 1;
            if (op.attempts < MAX_ATTEMPTS) {
              // Rotate to the back so one bad op doesn't block the queue.
              const rotated = { ...op, seq: nextSeq() } as OutboxOp;
              commit([...opsRef.current.filter((o) => o.id !== op.id), rotated]);
              await save(rotated);
              continue;
            }
            toast.error(`Couldn't sync a change: ${message ?? "unknown error"}`);
          }
          await remove(op.id);
          commit(opsRef.current.filter((o) => o.id !== op.id));
          if (op.kind === "photo") setPhotoStatus(op.payload.photoId, "done");
          didWork = true;
          backoff.current = 2_000;
          setAuthPaused(false);
          continue;
        }
        if (result === "auth") setAuthPaused(true);
        // transient / auth → back off and retry later
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void run(), backoff.current);
        backoff.current = Math.min(backoff.current * 2, 60_000);
        break;
      }
    } finally {
      running.current = false;
      setSyncing(false);
      if (didWork) scheduleRefresh();
    }
  }, [commit, execute, remove, save, scheduleRefresh, setPhotoStatus]);

  // Boot: load persisted ops, wire connectivity events.
  useEffect(() => {
    let cancelled = false;
    setOnline(navigator.onLine);
    (async () => {
      let loaded: OutboxOp[] = [];
      if (isIdbAvailable()) {
        try {
          loaded = await loadAll();
        } catch {
          persist.current = false;
        }
      } else {
        persist.current = false;
      }
      if (cancelled) return;
      const restored: Record<string, LocalPhoto> = {};
      for (const op of loaded) {
        if (op.kind === "photo") {
          restored[op.payload.photoId] = {
            photoId: op.payload.photoId,
            url: URL.createObjectURL(op.blob),
            status: "queued",
            target: op.payload,
            takenAt: op.payload.takenAt,
          };
        }
      }
      setPhotos((prev) => ({ ...restored, ...prev }));
      commit([...loaded, ...opsRef.current]);
      setReady(true);
      void run();
    })();

    const goOnline = () => {
      setOnline(true);
      backoff.current = 2_000;
      void run();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before closing the tab with unsynced work.
  useEffect(() => {
    if (!ops.length) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (persist.current) return; // safely on disk
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ops.length]);

  /** Collapse into a queued op with the same key, or append a new one. */
  const upsertOp = useCallback(
    (make: (existing?: OutboxOp) => OutboxOp) => {
      const draft = make();
      const existing = opsRef.current.find((o) => o.key === draft.key && o.kind === draft.kind && o.id !== inflight.current);
      const op = existing ? make(existing) : draft;
      const next = existing
        ? opsRef.current.map((o) => (o.id === existing.id ? op : o))
        : [...opsRef.current, op];
      commit(next);
      void save(op);
      void run();
    },
    [commit, run, save],
  );

  const saveAnswer = useCallback<OutboxContext["saveAnswer"]>(
    (p) =>
      upsertOp((existing) => ({
        id: existing?.id ?? crypto.randomUUID(),
        seq: existing?.seq ?? nextSeq(),
        key: `answer:${p.projectId}:${p.questionKey}`,
        kind: "answer",
        attempts: 0,
        payload: { ...p, clientUpdatedAt: new Date().toISOString() },
      })),
    [upsertOp],
  );

  const saveRecord = useCallback<OutboxContext["saveRecord"]>(
    (p) =>
      upsertOp((existing) => ({
        id: existing?.id ?? crypto.randomUUID(),
        seq: existing?.seq ?? nextSeq(),
        key: `record:${p.recordId}`,
        kind: "record",
        attempts: 0,
        payload: { ...p, clientUpdatedAt: new Date().toISOString() },
      })),
    [upsertOp],
  );

  const removeRecord = useCallback<OutboxContext["removeRecord"]>(
    (projectId, recordId) => {
      const dropped = opsRef.current.filter(
        (o) =>
          o.id !== inflight.current &&
          ((o.kind === "record" && o.payload.recordId === recordId) ||
            (o.kind === "photo" && o.payload.recordId === recordId)),
      );
      for (const o of dropped) void remove(o.id);
      const op: OutboxOp = {
        id: crypto.randomUUID(),
        seq: nextSeq(),
        key: `record:${recordId}`,
        kind: "record_delete",
        attempts: 0,
        payload: { projectId, recordId },
      };
      commit([...opsRef.current.filter((o) => !dropped.includes(o)), op]);
      setDeleted((prev) => new Set(prev).add(recordId));
      void save(op);
      void run();
    },
    [commit, remove, run, save],
  );

  const addPhotos = useCallback<OutboxContext["addPhotos"]>(
    async (files, target, meta) => {
      const newOps: OutboxOp[] = [];
      const newLocal: Record<string, LocalPhoto> = {};
      for (const file of files) {
        const img = await processImage(file);
        const photoId = crypto.randomUUID();
        const takenAt = new Date().toISOString();
        newOps.push({
          id: crypto.randomUUID(),
          seq: nextSeq(),
          key: `photo:${photoId}`,
          kind: "photo",
          attempts: 0,
          blob: img.blob,
          payload: {
            ...target,
            projectId: meta.projectId,
            pathPrefix: meta.pathPrefix,
            photoId,
            mimeType: img.mimeType,
            sizeBytes: img.blob.size,
            widthPx: img.width,
            heightPx: img.height,
            takenAt,
          },
        });
        newLocal[photoId] = {
          photoId,
          url: URL.createObjectURL(img.blob),
          status: "queued",
          target,
          takenAt,
        };
      }
      setPhotos((prev) => ({ ...prev, ...newLocal }));
      commit([...opsRef.current, ...newOps]);
      await Promise.all(newOps.map((o) => save(o)));
      void run();
    },
    [commit, run, save],
  );

  const forgetLocalPhotos = useCallback((ids: string[]) => {
    setPhotos((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const p = next[id];
        if (p && p.status === "done") {
          URL.revokeObjectURL(p.url);
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const value = useMemo<OutboxContext>(() => {
    const keys = new Set(ops.map((o) => o.key));
    return {
      ready,
      online,
      syncing,
      authPaused,
      pendingCount: ops.length,
      pendingPhotoCount: ops.filter((o) => o.kind === "photo").length,
      isPending: (key) => keys.has(key),
      pendingAnswer: (projectId, questionKey) => {
        const op = ops.find((o) => o.kind === "answer" && o.key === `answer:${projectId}:${questionKey}`);
        return op?.kind === "answer" ? op.payload : undefined;
      },
      pendingRecords: (projectId, tableKey) =>
        ops.flatMap((o) =>
          o.kind === "record" && o.payload.projectId === projectId && o.payload.tableKey === tableKey
            ? [o.payload]
            : [],
        ),
      isRecordDeleted: (id) => deleted.has(id),
      saveAnswer,
      saveRecord,
      removeRecord,
      addPhotos,
      localPhotos: (match) =>
        Object.values(photos)
          .filter((p) => match(p.target))
          .sort((a, b) => a.takenAt.localeCompare(b.takenAt)),
      forgetLocalPhotos,
      flush: () => {
        backoff.current = 2_000;
        void run();
      },
    };
  }, [ops, ready, online, syncing, authPaused, deleted, photos, saveAnswer, saveRecord, removeRecord, addPhotos, forgetLocalPhotos, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
