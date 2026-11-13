/**
 * Device-side outbox persisted in IndexedDB. Every capture write lands
 * here first, so nothing is lost if the walker loses signal, locks the
 * phone, or the browser kills the tab.
 */

export type AnswerPayload = {
  projectId: string;
  questionKey: string;
  value: { v?: unknown; extras?: Record<string, string | number | null> };
  notApplicable: boolean;
  notes: string | null;
  clientUpdatedAt: string;
};

export type RecordPayload = {
  projectId: string;
  recordId: string;
  tableKey: string;
  data: Record<string, string>;
  sortOrder?: number;
  clientUpdatedAt: string;
};

export type PhotoTarget = {
  questionKey?: string | null;
  recordId?: string | null;
  sectionKey?: string | null;
};

export type PhotoPayload = PhotoTarget & {
  projectId: string;
  photoId: string;
  pathPrefix: string;
  mimeType: string;
  sizeBytes: number;
  widthPx?: number;
  heightPx?: number;
  caption?: string | null;
  takenAt: string;
  uploaded?: { url: string; pathname: string };
};

type OpBase = {
  id: string;
  seq: number;
  key: string;
  attempts: number;
  /** Failed repeatedly with a server error: kept on the phone, skipped by
   *  the sync loop until the walker taps retry. Never silently deleted. */
  parked?: boolean;
};

export type OutboxOp =
  | (OpBase & { kind: "answer"; payload: AnswerPayload })
  | (OpBase & { kind: "record"; payload: RecordPayload })
  | (OpBase & { kind: "record_delete"; payload: { projectId: string; recordId: string } })
  | (OpBase & { kind: "photo"; payload: PhotoPayload; blob: Blob });

/** On disk, photo bytes are kept as an ArrayBuffer: Blobs held in
 *  IndexedDB have proved unreliable in iOS Safari. */
type StoredOp = Omit<OutboxOp, "blob"> & { blob?: Blob; bytes?: ArrayBuffer; bytesType?: string };

const DB_NAME = "dealscope-discovery";
const STORE = "outbox";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // iOS closes the connection when Safari is backgrounded (screen lock,
      // switching to the camera). Forget it so the next write reconnects
      // instead of failing for the rest of the session.
      db.onclose = () => {
        if (dbPromise) dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB blocked"));
    };
  });
  return dbPromise;
}

function once<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        let t: IDBTransaction;
        try {
          t = db.transaction(STORE, mode);
        } catch (e) {
          // "Connection lost" / InvalidStateError: the cached handle is dead.
          dbPromise = null;
          reject(e);
          return;
        }
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("Transaction aborted"));
      }),
  );
}

/** Run a transaction; on failure reconnect once and try again. */
async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  try {
    return await once(mode, fn);
  } catch {
    dbPromise = null;
    return once(mode, fn);
  }
}

export async function loadAll(): Promise<OutboxOp[]> {
  const rows = ((await tx<StoredOp[]>("readonly", (s) => s.getAll())) ?? []) as StoredOp[];
  const ops = rows.map((r) => {
    if (r.kind !== "photo") return r as OutboxOp;
    const { bytes, bytesType, ...rest } = r;
    const blob = bytes ? new Blob([bytes], { type: bytesType || (r.payload as PhotoPayload).mimeType }) : r.blob;
    return { ...rest, blob } as OutboxOp;
  });
  // A photo row without bytes can't be uploaded; keep it out of the queue
  // but leave it on disk rather than deleting anything.
  return ops.filter((o) => o.kind !== "photo" || o.blob).sort((a, b) => a.seq - b.seq);
}

export async function putOp(op: OutboxOp) {
  if (op.kind === "photo") {
    const bytes = await op.blob.arrayBuffer();
    const stored: StoredOp = { ...op, blob: undefined, bytes, bytesType: op.blob.type };
    return tx("readwrite", (s) => s.put(stored));
  }
  return tx("readwrite", (s) => s.put(op));
}

export function deleteOp(id: string) {
  return tx("readwrite", (s) => s.delete(id));
}

/** Ask the browser not to evict our storage under pressure (best effort). */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist?.();
    }
  } catch {
    /* not supported */
  }
}

let counter = 0;
export function nextSeq() {
  counter = (counter + 1) % 1000;
  return Date.now() * 1000 + counter;
}

export function isIdbAvailable() {
  return typeof indexedDB !== "undefined";
}
