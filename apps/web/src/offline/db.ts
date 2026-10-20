/**
 * Lokalna baza w przeglądarce (IndexedDB), dwie tabele:
 * - kv: ostatnie odpowiedzi API i lokalne kopie treningów (działa bez sieci),
 * - outbox: kolejka zmian do wysłania, w kolejności zapisu.
 */

const DB_NAME = "pixgym";
const VERSION = 1;

export interface OutboxOp {
  seq?: number;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  // Trening, którego dotyczy zmiana: dopóki coś czeka, jego lokalna kopia jest ważniejsza.
  sessionId?: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const kv = {
  get: <T>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key)).catch(() => undefined),
  set: (key: string, value: unknown) => run<void>("kv", "readwrite", (s) => s.put(value, key)).catch(() => undefined),
  del: (key: string) => run<void>("kv", "readwrite", (s) => s.delete(key)).catch(() => undefined),
  clear: () => run<void>("kv", "readwrite", (s) => s.clear()).catch(() => undefined),
};

export const outbox = {
  add: (op: OutboxOp) => run<number>("outbox", "readwrite", (s) => s.add(op)),
  all: () => run<OutboxOp[]>("outbox", "readonly", (s) => s.getAll()).catch(() => [] as OutboxOp[]),
  remove: (seq: number) => run<void>("outbox", "readwrite", (s) => s.delete(seq)),
  clear: () => run<void>("outbox", "readwrite", (s) => s.clear()).catch(() => undefined),
};
