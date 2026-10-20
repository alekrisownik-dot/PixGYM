/**
 * Wydarzenia w kalendarzu offline: zmiana od razu trafia do lokalnej nakładki i do kolejki
 * (outbox). Dopóki zmiana czeka na wysłanie, nakładka jest ważniejsza niż kopia z serwera.
 */

import { uuid7, type CalendarEvent } from "../api";
import { kv, outbox } from "./db";
import { cachedGet } from "./sessions";
import { enqueue } from "./sync";

const KEY = "events:local";

/** Lokalne zmiany: wydarzenie albo znacznik usunięcia. */
type Overlay = Record<string, CalendarEvent | { id: string; deleted: true }>;

async function overlay(): Promise<Overlay> {
  const all = (await kv.get<Overlay>(KEY)) ?? {};
  // Wpis znika z nakładki, gdy w kolejce nie ma już żadnej zmiany tego wydarzenia.
  // Utworzenie ma ID w treści (POST /events), zmiana i usunięcie w ścieżce.
  const ops = await outbox.all();
  const pending = (id: string) => ops.some((o) => o.path.includes(id) || (o.body as { id?: string } | undefined)?.id === id);
  const live = Object.fromEntries(Object.entries(all).filter(([id]) => pending(id)));
  if (Object.keys(live).length !== Object.keys(all).length) await kv.set(KEY, live);
  return live;
}

async function put(e: CalendarEvent | { id: string; deleted: true }) {
  await kv.set(KEY, { ...((await kv.get<Overlay>(KEY)) ?? {}), [e.id]: e });
}

export async function listEvents(start: string, end: string): Promise<CalendarEvent[]> {
  const server = await cachedGet<CalendarEvent[]>(`/events?start=${start}&end=${end}`).catch(() => [] as CalendarEvent[]);
  const local = await overlay();
  const merged = new Map(server.map((e) => [e.id, e]));
  for (const e of Object.values(local)) {
    if ("deleted" in e) merged.delete(e.id);
    else if (e.date >= start && e.date <= end) merged.set(e.id, e);
    else merged.delete(e.id); // przeniesione na dzień spoza zakresu
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveEvent(data: Omit<CalendarEvent, "id">, id?: string): Promise<CalendarEvent> {
  const e: CalendarEvent = { id: id ?? uuid7(), ...data };
  await put(e);
  await enqueue(id ? { method: "PATCH", path: `/events/${id}`, body: data } : { method: "POST", path: "/events", body: e });
  return e;
}

export async function deleteEvent(id: string): Promise<void> {
  await put({ id, deleted: true });
  await enqueue({ method: "DELETE", path: `/events/${id}` });
}
