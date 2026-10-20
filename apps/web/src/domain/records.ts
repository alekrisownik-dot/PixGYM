import type { Tracking } from "./e1rm";
import { r2 } from "./rounding";

/** nRM = największy ciężar podniesiony na co najmniej n powtórzeń. */
export const REP_MAX_TARGETS = [2, 3, 5, 8, 10, 12];

export type RecordType = "one_rm" | "e1rm" | "rep_max" | "set_volume" | "bodyweight_reps";

export interface RecordSet {
  id: string;
  achieved_at: string; // ISO 8601 UTC
  tracking: Tracking;
  set_type: string;
  reps: number | null;
  effective_kg: number | null;
  e1rm_kg: number | null;
  added_kg?: number | null;
}

export interface RecordValue {
  record_type: RecordType;
  reps: number | null;
  value: number;
}

export interface RecordEntry extends RecordValue {
  set_id: string;
  achieved_at: string;
  superseded_at: string | null;
}

export const recordKey = (type: RecordType, reps: number | null) => `${type}:${reps ?? ""}`;

/** Wszystkie wartości rekordowe, które może ustanowić dana seria. */
export function candidates(s: RecordSet): RecordValue[] {
  if (s.set_type === "warmup" || !s.reps) return [];
  const out: RecordValue[] = [];
  const w = s.effective_kg;
  if (w != null && w > 0) {
    if (s.reps === 1) out.push({ record_type: "one_rm", reps: null, value: w });
    if (s.e1rm_kg != null) out.push({ record_type: "e1rm", reps: null, value: s.e1rm_kg });
    for (const n of REP_MAX_TARGETS) {
      if (s.reps >= n) out.push({ record_type: "rep_max", reps: n, value: w });
    }
    out.push({ record_type: "set_volume", reps: null, value: r2(w * s.reps) });
  }
  if (s.tracking === "bodyweight_reps" && !s.added_kg) {
    out.push({ record_type: "bodyweight_reps", reps: null, value: s.reps });
  }
  return out;
}

/** Rekordy pobite przez serię. best: klucz z recordKey(). Remis nie jest rekordem. */
export function newRecords(best: ReadonlyMap<string, number>, s: RecordSet): RecordValue[] {
  return candidates(s).filter((c) => {
    const current = best.get(recordKey(c.record_type, c.reps));
    return current === undefined || c.value > current;
  });
}

/** Historia rekordów w kolejności ustanawiania. Pobite mają superseded_at. */
export function recordHistory(sets: Iterable<RecordSet>): RecordEntry[] {
  const sorted = [...sets].sort((a, b) =>
    a.achieved_at !== b.achieved_at
      ? a.achieved_at < b.achieved_at ? -1 : 1
      : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const best = new Map<string, number>();
  const current = new Map<string, RecordEntry>();
  const history: RecordEntry[] = [];
  for (const s of sorted) {
    for (const rec of newRecords(best, s)) {
      const key = recordKey(rec.record_type, rec.reps);
      const previous = current.get(key);
      if (previous) previous.superseded_at = s.achieved_at;
      const entry: RecordEntry = { ...rec, set_id: s.id, achieved_at: s.achieved_at, superseded_at: null };
      history.push(entry);
      current.set(key, entry);
      best.set(key, rec.value);
    }
  }
  return history;
}
