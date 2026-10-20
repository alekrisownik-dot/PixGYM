/**
 * Podpowiedź ciężaru na następny trening, według reguł z tabeli progression_rules.
 * Lustro pixgym.domain.progression: funkcje czyste, historię i stan podaje wywołujący.
 */
import { rtsPct } from "./e1rm";
import { roundTo } from "./rounding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Params = Record<string, any>;
export const DEFAULT_STEP_KG = 2.5;

/** Serie robocze jednego ćwiczenia z jednego treningu (ten sam ciężar). */
export interface Performance {
  weight_kg: number;
  reps: readonly number[];
}

export interface SetTarget {
  weight_kg: number | null;
  reps: number;
  amrap: boolean;
}

export interface SchemeEntry {
  pct?: number;
  reps: number;
  amrap?: boolean;
  tm_of?: string;
}

const target = (weight_kg: number | null, reps: number, amrap = false): SetTarget => ({ weight_kg, reps, amrap });
const times = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

export function increment(params: Params, isLower: boolean): number {
  const key = isLower ? "increment_lower_kg" : "increment_upper_kg";
  return params[key] ?? params.increment_kg ?? DEFAULT_STEP_KG;
}

/** Czy zrobiono co najmniej `sets` serii po co najmniej `reps` powtórzeń. */
export function hitAll(perf: Performance, sets: number, reps: number): boolean {
  return perf.reps.length >= sets && perf.reps.slice(0, sets).every((r) => r >= reps);
}

/** Najpierw powtórzenia do rep_max we wszystkich seriach, potem ciężar w górę. */
export function doubleProgression(
  params: Params,
  last: Performance,
  targetSets: number,
  repMin: number,
  repMax: number | null,
  isLower: boolean,
): SetTarget[] {
  if (repMax == null) return times(targetSets, () => target(last.weight_kg, repMin, true));
  if (hitAll(last, targetSets, repMax)) {
    const weight = roundTo(last.weight_kg + increment(params, isLower), 0.01);
    return times(targetSets, () => target(weight, repMin));
  }
  const done = [...last.reps, ...times(Math.max(0, targetSets - last.reps.length), () => repMin - 1)];
  return done.slice(0, targetSets).map((r) => target(last.weight_kg, Math.min(repMax, Math.max(repMin, r + 1))));
}

/** Każdy udany trening +increment. Po N nieudanych z rzędu na tym samym ciężarze: deload. */
export function linearProgression(
  params: Params,
  history: readonly Performance[],
  targetSets: number,
  reps: number,
  isLower: boolean,
  stepKg = DEFAULT_STEP_KG,
): SetTarget[] {
  const last = history[history.length - 1]!;
  let weight: number;
  if (hitAll(last, targetSets, reps)) {
    weight = roundTo(last.weight_kg + increment(params, isLower), 0.01);
  } else {
    let fails = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const perf = history[i]!;
      if (perf.weight_kg !== last.weight_kg || hitAll(perf, targetSets, reps)) break;
      fails++;
    }
    weight =
      fails >= (params.fails_before_deload ?? 3)
        ? roundTo(last.weight_kg * (1 - (params.deload_pct ?? 0.1)), stepKg)
        : last.weight_kg;
  }
  return times(targetSets, () => target(weight, reps));
}

/** Ciężar z szacowanego 1RM tak, żeby środek zakresu wypadł na docelowym RPE. */
export function rpeTarget(
  params: Params,
  e1rmKg: number,
  targetSets: number,
  repMin: number,
  repMax: number | null,
  targetRpe: number,
): SetTarget[] {
  const reps = repMax != null ? Math.floor((repMin + repMax) / 2) : repMin;
  const pct = rtsPct(reps, targetRpe);
  const weight = pct != null ? roundTo(e1rmKg * pct, params.round_to_kg ?? DEFAULT_STEP_KG) : null;
  return times(targetSets, () => target(weight, reps));
}

/** Początkowy training max (5/3/1, nSuns): ułamek szacowanego 1RM. */
export function trainingMax(params: Params, e1rmKg: number, stepKg = DEFAULT_STEP_KG): number {
  return roundTo(e1rmKg * (params.tm_pct ?? 0.9), stepKg);
}

/** Serie z program_exercises.set_scheme. Wpisy bez pct (GZCLP) nie mają ciężaru. */
export function schemeSets(scheme: readonly SchemeEntry[], tmKg: number | null, stepKg = DEFAULT_STEP_KG): SetTarget[] {
  return scheme.map((s) =>
    target(s.pct != null && tmKg ? roundTo(tmKg * s.pct, stepKg) : null, s.reps, Boolean(s.amrap)),
  );
}

/** Serie główne 5/3/1 dla tygodnia cyklu (0-3, ostatni to deload). */
export function wendlerSets(params: Params, tmKg: number, week: number, stepKg = DEFAULT_STEP_KG): SetTarget[] {
  const weeks: [number, number, boolean][][] = params.weeks;
  return weeks[week % weeks.length]!.map(([pct, reps, amrap]) => target(roundTo(tmKg * pct, stepKg), reps, amrap));
}

/** Training max na kolejny cykl. */
export function wendlerNextTm(params: Params, tmKg: number, isLower: boolean): number {
  return roundTo(tmKg + increment(params, isLower), 0.01);
}

/** Wzrost TM zależny od powtórzeń w serii 1+ (na 95%). */
export function nsunsNextTm(params: Params, tmKg: number, amrapReps: number, isLower: boolean): number {
  let add = 0;
  for (const step of params.amrap_increments) {
    if (amrapReps >= step.min_reps) add = isLower ? step.lower_kg : step.upper_kg;
  }
  return roundTo(tmKg + add, 0.01);
}

export interface GzclpState {
  stage: number;
  weight_kg: number;
}

/** Stan po treningu. T1/T2: success = wszystkie serie zrobione. T3: decyduje amrapReps. */
export function gzclpNext(
  params: Params,
  state: GzclpState,
  isLower: boolean,
  success?: boolean | null,
  amrapReps?: number | null,
  stepKg = DEFAULT_STEP_KG,
): GzclpState {
  if (params.tier === 3) {
    if (amrapReps != null && amrapReps >= params.amrap_target) {
      return { stage: 0, weight_kg: roundTo(state.weight_kg + params.increment_kg, 0.01) };
    }
    return { stage: 0, weight_kg: state.weight_kg };
  }
  if (success) return { stage: state.stage, weight_kg: roundTo(state.weight_kg + increment(params, isLower), 0.01) };
  if (state.stage + 1 < params.stages.length) return { stage: state.stage + 1, weight_kg: state.weight_kg };
  return { stage: 0, weight_kg: roundTo(state.weight_kg * params.reset_pct, stepKg) };
}

/** Serie dla bieżącego etapu. Ostatnia seria T1 i T3 to AMRAP. */
export function gzclpSets(params: Params, state: GzclpState): SetTarget[] {
  const [sets, reps]: [number, number] = params.tier === 3 ? [3, 15] : params.stages[state.stage];
  const amrapLast = params.tier === 1 || params.tier === 3;
  return times(sets, (i) => target(state.weight_kg, reps, amrapLast && i === sets - 1));
}
