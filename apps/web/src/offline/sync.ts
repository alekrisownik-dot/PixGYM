/**
 * Kolejka zmian (outbox). Każda zmiana w treningu najpierw trafia do lokalnej bazy,
 * potem jest wysyłana na serwer w kolejności zapisu. Bez sieci czeka i wysyła się sama,
 * gdy sieć wróci. Wysłanie dwa razy niczego nie dubluje: ID nadaje telefon, a serwer
 * traktuje powtórzone utworzenie jako już wykonane.
 */

import { ApiError, NetworkError, api, type SavedSet } from "../api";
import { kv, outbox, type OutboxOp } from "./db";

export interface SyncState {
  pending: number;
  syncing: boolean;
  // Ostatnia próba nie doszła do serwera.
  offline: boolean;
  // Ekran pokazuje dane z pamięci telefonu, bo serwer nie odpowiedział.
  stale: boolean;
  // Zmiany odrzucone przez serwer (np. błędne dane); nie da się ich ponowić.
  rejected: string[];
}

let state: SyncState = { pending: 0, syncing: false, offline: !navigator.onLine, stale: false, rejected: [] };
const listeners = new Set<(s: SyncState) => void>();

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function subscribe(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const SET_SYNCED = "pixgym:set-synced";

/** Serwer policzył serię: podmieniamy 1RM w lokalnej kopii i dajemy znać ekranowi (rekordy). */
async function onSetSaved(op: OutboxOp, saved: SavedSet) {
  if (op.sessionId) {
    const key = `session:${op.sessionId}`;
    const local = await kv.get<import("../api").Session>(key);
    if (local) {
      for (const e of local.exercises) {
        const s = e.sets.find((x) => x.id === saved.id);
        if (s) Object.assign(s, { effective_kg: saved.effective_kg, e1rm_kg: saved.e1rm_kg });
      }
      await kv.set(key, local);
    }
  }
  window.dispatchEvent(new CustomEvent<SavedSet>(SET_SYNCED, { detail: saved }));
}

export async function pendingSessionIds(): Promise<Set<string>> {
  const ops = await outbox.all();
  return new Set(ops.map((o) => o.sessionId).filter((x): x is string => !!x));
}

export async function enqueue(op: Omit<OutboxOp, "createdAt" | "seq">): Promise<void> {
  await outbox.add({ ...op, createdAt: Date.now() });
  set({ pending: (await outbox.all()).length });
  void flush();
}

let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(ms: number) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void flush(), ms);
}

export function flush(): Promise<void> {
  running ??= doFlush().finally(() => {
    running = null;
  });
  return running;
}

async function doFlush() {
  let ops = await outbox.all();
  set({ pending: ops.length });
  if (!ops.length) return;
  set({ syncing: true });
  try {
    while (ops.length) {
      const op = ops[0]!;
      try {
        const res = await api.request<unknown>(op.method, op.path, op.body);
        if (op.method === "PUT" && op.path.startsWith("/sets/")) await onSetSaved(op, res as SavedSet);
      } catch (e) {
        if (e instanceof NetworkError) {
          set({ offline: true });
          scheduleRetry(15_000);
          return;
        }
        if (e instanceof ApiError) {
          // Już utworzone albo już usunięte: cel osiągnięty.
          const done = e.status === 409 || (e.status === 404 && op.method === "DELETE");
          if (e.status === 401 || e.status >= 500 || e.status === 429) {
            scheduleRetry(30_000);
            return;
          }
          if (!done) set({ rejected: [...state.rejected, `${op.method} ${op.path}: ${e.detail}`] });
        } else {
          throw e;
        }
      }
      await outbox.remove(op.seq!);
      ops = await outbox.all();
      set({ pending: ops.length, offline: false });
    }
  } finally {
    set({ syncing: false });
  }
}

export function setStale(stale: boolean) {
  if (state.stale !== stale) set({ stale });
}

export function dismissRejected() {
  set({ rejected: [] });
}

export function startSync() {
  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  void flush();
}
