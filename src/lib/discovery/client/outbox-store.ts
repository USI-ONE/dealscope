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

export type OutboxOp =
  | { id: string; seq: number; key: string; kind: "answer"; attempts: number; payload: AnswerPayload }
  | { id: string; seq: number; key: string; kind: "record"; attempts: number; payload: RecordPayload }
  | {
      id: string;
      seq: number;
      key: string;
      kind: "record_delete";
      attempts: number;
      payload: { projectId: string; recordId: string };
    }
  | { id: string; seq: number; key: string; kind: "photo"; attempts: number; payload: PhotoPayload; blob: Blob };

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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function loadAll(): Promise<OutboxOp[]> {
  const rows = (await tx<OutboxOp[]>("readonly", (s) => s.getAll())) ?? [];
  return rows.sort((a, b) => a.seq - b.seq);
}

export function putOp(op: OutboxOp) {
  return tx("readwrite", (s) => s.put(op));
}

export function deleteOp(id: string) {
  return tx("readwrite", (s) => s.delete(id));
}

let counter = 0;
export function nextSeq() {
  counter = (counter + 1) % 1000;
  return Date.now() * 1000 + counter;
}

export function isIdbAvailable() {
  return typeof indexedDB !== "undefined";
}
