import { effortRpe } from "./e1rm";
import { r2 } from "./rounding";

/** Ciężka seria: robocza, najwyżej 4 powtórzenia w zapasie. */
export const HARD_SET_MAX_RIR = 4;

export interface VolumeSet {
  set_type: string;
  reps: number | null;
  effective_kg: number | null;
  rpe?: number | null;
  rir?: number | null;
  /** [slug partii, udział]: główna 1.0, pomocnicza 0.5 */
  muscles: ReadonlyArray<readonly [string, number]>;
}

export interface MuscleVolume {
  hard_sets: number;
  tonnage_kg: number;
}

/** Bez podanego RPE/RIR seria robocza liczy się jako ciężka. */
export function isHardSet(set_type: string, rpe?: number | null, rir?: number | null): boolean {
  if (set_type === "warmup") return false;
  const effort = effortRpe(rpe, rir);
  return effort == null || 10 - effort <= HARD_SET_MAX_RIR;
}

export function setTonnage(set_type: string, effective_kg: number | null, reps: number | null): number {
  if (set_type === "warmup" || effective_kg == null || !reps) return 0;
  return r2(effective_kg * reps);
}

/** Ciężkie serie liczone z udziałem partii; tonaż tylko dla partii głównych. */
export function muscleVolume(sets: Iterable<VolumeSet>): Record<string, MuscleVolume> {
  const out: Record<string, MuscleVolume> = {};
  for (const s of sets) {
    const hard = isHardSet(s.set_type, s.rpe, s.rir);
    const tonnage = setTonnage(s.set_type, s.effective_kg, s.reps);
    for (const [slug, contribution] of s.muscles) {
      const mv = (out[slug] ??= { hard_sets: 0, tonnage_kg: 0 });
      if (hard) mv.hard_sets += contribution;
      if (contribution >= 1) mv.tonnage_kg = r2(mv.tonnage_kg + tonnage);
    }
  }
  return out;
}

/** Poniedziałek tygodnia (ISO) dla daty w formacie YYYY-MM-DD. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
