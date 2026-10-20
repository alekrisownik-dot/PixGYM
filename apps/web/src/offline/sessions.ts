/**
 * Treningi „najpierw lokalnie”. Każda zmiana od razu zmienia lokalną kopię (ekran
 * reaguje natychmiast, także bez sieci) i trafia do kolejki. Dopóki w kolejce coś czeka
 * na dany trening, lokalna kopia jest ważniejsza niż to, co ma serwer.
 */

import {
  NetworkError,
  api,
  uuid7,
  type Exercise,
  type PlanDay,
  type Session,
  type SessionListItem,
  type SetType,
  type WorkoutSet,
} from "../api";
import { estimate1rm, setTonnage } from "../domain";
import { kv } from "./db";
import { enqueue, pendingSessionIds } from "./sync";

const key = (id: string) => `session:${id}`;

/** GET z zapasem: odpowiedź trafia do lokalnej bazy, bez sieci wraca ostatnia znana. */
export async function cachedGet<T>(path: string): Promise<T> {
  try {
    const data = await api.get<T>(path);
    void kv.set(`get:${path}`, data);
    return data;
  } catch (e) {
    if (e instanceof NetworkError) {
      const cached = await kv.get<T>(`get:${path}`);
      if (cached !== undefined) return cached;
    }
    throw e;
  }
}

export async function loadSession(id: string): Promise<Session> {
  const local = await kv.get<Session>(key(id));
  if (local && (await pendingSessionIds()).has(id)) return local;
  try {
    const fresh = await api.get<Session>(`/sessions/${id}`);
    await kv.set(key(id), fresh);
    return fresh;
  } catch (e) {
    if (e instanceof NetworkError && local) return local;
    throw e;
  }
}

async function save(s: Session) {
  await kv.set(key(s.id), s);
}

function localDate(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** Nowy trening: pusty albo z dnia planu (ćwiczenia z bloczków od razu na liście). */
export async function startSession(day?: PlanDay): Promise<Session> {
  const now = new Date();
  const s: Session = {
    id: uuid7(),
    started_at: now.toISOString(),
    ended_at: null,
    local_date: localDate(now),
    bodyweight_kg: null,
    notes: null,
    program_day_id: day?.id ?? null,
    day_name: day?.name ?? null,
    exercises: (day?.blocks ?? []).map((b, position) => ({
      id: uuid7(),
      exercise_id: b.exercise_id,
      position,
      notes: null,
      name: b.name,
      tracking: b.tracking,
      sets: [],
      target: b,
    })),
  };
  await save(s);
  await enqueue({
    method: "POST",
    path: "/sessions",
    body: { id: s.id, started_at: s.started_at, program_day_id: s.program_day_id },
    sessionId: s.id,
  });
  for (const e of s.exercises)
    await enqueue({ method: "POST", path: `/sessions/${s.id}/exercises`, body: { id: e.id, exercise_id: e.exercise_id }, sessionId: s.id });
  return s;
}

/** Dzień planu odhaczony bez zapisywania serii: krótki, od razu zakończony trening. */
export async function completeDay(day: PlanDay): Promise<Session> {
  const now = new Date();
  const s: Session = {
    id: uuid7(),
    started_at: now.toISOString(),
    ended_at: now.toISOString(),
    local_date: localDate(now),
    bodyweight_kg: null,
    notes: DAY_DONE_NOTE,
    program_day_id: day.id ?? null,
    day_name: day.name,
    exercises: [],
  };
  await save(s);
  await enqueue({ method: "POST", path: "/sessions", body: { id: s.id, started_at: s.started_at, program_day_id: s.program_day_id }, sessionId: s.id });
  await enqueue({ method: "PATCH", path: `/sessions/${s.id}`, body: { ended_at: s.ended_at, notes: s.notes }, sessionId: s.id });
  return s;
}

export const DAY_DONE_NOTE = "Dzień planu zaliczony bez zapisu serii.";

/** Treningi, które jeszcze czekają na wysłanie (np. zaliczone bez sieci). */
export async function pendingSessions(): Promise<Session[]> {
  const out: Session[] = [];
  for (const id of await pendingSessionIds()) {
    const s = await kv.get<Session>(key(id));
    if (s) out.push(s);
  }
  return out;
}

export async function patchSession(s: Session, changes: Partial<Pick<Session, "ended_at" | "bodyweight_kg" | "notes">>): Promise<Session> {
  const next = { ...s, ...changes };
  await save(next);
  await enqueue({ method: "PATCH", path: `/sessions/${s.id}`, body: changes, sessionId: s.id });
  return next;
}

export async function deleteSession(s: Session): Promise<void> {
  await kv.del(key(s.id));
  await enqueue({ method: "DELETE", path: `/sessions/${s.id}`, sessionId: s.id });
}

export async function addExercise(s: Session, e: Exercise): Promise<{ session: Session; id: string }> {
  const id = uuid7();
  const next: Session = {
    ...s,
    exercises: [
      ...s.exercises,
      {
        id,
        exercise_id: e.id,
        position: Math.max(-1, ...s.exercises.map((x) => x.position)) + 1,
        notes: null,
        name: e.name,
        tracking: e.tracking,
        sets: [],
      },
    ],
  };
  await save(next);
  await enqueue({ method: "POST", path: `/sessions/${s.id}/exercises`, body: { id, exercise_id: e.id }, sessionId: s.id });
  return { session: next, id };
}

export async function removeExercise(s: Session, sessionExerciseId: string): Promise<Session> {
  const next = { ...s, exercises: s.exercises.filter((x) => x.id !== sessionExerciseId) };
  await save(next);
  await enqueue({ method: "DELETE", path: `/session-exercises/${sessionExerciseId}`, sessionId: s.id });
  return next;
}

export interface SetInput {
  set_index: number;
  set_type: SetType;
  weight_kg: number | null;
  added_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  rpe: number | null;
  completed_at: string;
}

export async function saveSet(s: Session, sessionExerciseId: string, input: SetInput, setId = uuid7()): Promise<{ session: Session; set: WorkoutSet }> {
  const se = s.exercises.find((x) => x.id === sessionExerciseId)!;
  // Wynik od razu, bez czekania na serwer. Serwer i tak policzy go jeszcze raz (źródło prawdy).
  const effective = se.tracking === "weight_reps" ? input.weight_kg : null;
  const set: WorkoutSet = {
    id: setId,
    session_exercise_id: sessionExerciseId,
    side: "both",
    rir: null,
    ...input,
    effective_kg: effective,
    e1rm_kg: input.set_type === "warmup" ? null : estimate1rm({ weight: effective, reps: input.reps, rpe: input.rpe }),
  };
  const next: Session = {
    ...s,
    exercises: s.exercises.map((x) =>
      x.id !== sessionExerciseId ? x : { ...x, sets: [...x.sets.filter((y) => y.id !== setId), set].sort((a, b) => a.set_index - b.set_index) },
    ),
  };
  await save(next);
  await enqueue({ method: "PUT", path: `/sets/${setId}`, body: { session_exercise_id: sessionExerciseId, side: "both", ...input }, sessionId: s.id });
  return { session: next, set };
}

export async function deleteSet(s: Session, setId: string): Promise<Session> {
  const next = { ...s, exercises: s.exercises.map((x) => ({ ...x, sets: x.sets.filter((y) => y.id !== setId) })) };
  await save(next);
  await enqueue({ method: "DELETE", path: `/sets/${setId}`, sessionId: s.id });
  return next;
}

export function toListItem(s: Session): SessionListItem {
  const working = s.exercises.flatMap((e) => e.sets).filter((x) => x.set_type !== "warmup");
  return {
    id: s.id,
    started_at: s.started_at,
    ended_at: s.ended_at,
    local_date: s.local_date,
    exercise_count: s.exercises.length,
    set_count: working.length,
    tonnage_kg: working.reduce((t, x) => t + setTonnage(x.set_type, x.effective_kg, x.reps), 0),
  };
}

/** Lista treningów: z serwera (albo z pamięci) plus te, które jeszcze nie doszły na serwer. */
export async function listSessions(limit: number): Promise<SessionListItem[]> {
  const pending = await pendingSessionIds();
  let server: SessionListItem[] = [];
  try {
    server = await cachedGet<SessionListItem[]>(`/sessions?limit=${limit}`);
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
  }
  const byId = new Map(server.map((x) => [x.id, x]));
  for (const id of pending) {
    const local = await kv.get<Session>(key(id));
    if (local) byId.set(id, toListItem(local));
    else byId.delete(id); // usunięty lokalnie, czeka na wysłanie
  }
  return [...byId.values()].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit);
}
