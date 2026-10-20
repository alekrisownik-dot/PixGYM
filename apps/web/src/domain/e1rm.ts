import { r2 } from "./rounding";

/** Procent 1RM przy RPE 10 dla 1..12 powtórzeń (tabela RTS). */
export const RTS_PCT = [1.0, 0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.707, 0.68];

export const DEFAULT_MAX_REPS = 12;

export type E1rmMethod = "epley" | "brzycki" | "rpe";
export type Tracking = "weight_reps" | "bodyweight_reps" | "duration" | "distance";

export function rtsPct(reps: number, rpe: number): number | null {
  const effective = reps + (10 - rpe);
  if (effective < 1 || effective > RTS_PCT.length) return null;
  const lo = Math.floor(effective);
  const hi = Math.ceil(effective);
  const a = RTS_PCT[lo - 1]!;
  const b = RTS_PCT[hi - 1]!;
  return a + (b - a) * (effective - lo);
}

/** RPE z serii; jeśli podano tylko RIR, to RPE = 10 - RIR. */
export function effortRpe(rpe?: number | null, rir?: number | null): number | null {
  if (rpe != null) return rpe;
  if (rir != null) return 10 - rir;
  return null;
}

export interface Estimate1rmArgs {
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  rir?: number | null;
  method?: E1rmMethod;
  max_reps?: number;
}

/** Szacowany 1RM albo null, gdy seria się nie nadaje. Przy "rpe" bez wysiłku liczy Epleyem. */
export function estimate1rm({
  weight,
  reps,
  rpe,
  rir,
  method = "epley",
  max_reps = DEFAULT_MAX_REPS,
}: Estimate1rmArgs): number | null {
  if (weight == null || reps == null || weight <= 0 || reps < 1 || reps > max_reps) return null;
  if (reps === 1) return r2(weight);
  if (method === "rpe") {
    const effort = effortRpe(rpe, rir);
    if (effort != null && effort >= 6 && effort <= 10) {
      const pct = rtsPct(reps, effort);
      if (pct != null) return r2(weight / pct);
    }
  }
  if (method === "brzycki") return reps <= 10 ? r2((weight * 36) / (37 - reps)) : null;
  return r2(weight * (1 + reps / 30));
}

export interface EffectiveWeightArgs {
  tracking: Tracking;
  weight_kg: number | null;
  added_kg?: number | null;
  bodyweight_kg?: number | null;
  bw_factor?: number | null;
}

/** Ciężar, który faktycznie poruszasz. Z masą ciała: masa × udział + obciążenie. */
export function effectiveWeight({
  tracking,
  weight_kg,
  added_kg,
  bodyweight_kg,
  bw_factor,
}: EffectiveWeightArgs): number | null {
  if (tracking === "weight_reps") return weight_kg != null ? r2(weight_kg) : null;
  if (tracking === "bodyweight_reps") {
    if (bodyweight_kg == null) return null;
    return r2(bodyweight_kg * (bw_factor ?? 1.0) + (added_kg || 0));
  }
  return null;
}
