import { r2, roundTo } from "./rounding";

const grams = (kg: number) => Math.floor(kg * 1000 + 0.5);

export interface PlateLoad {
  per_side: number[]; // od największego
  total_kg: number;
  exact: boolean;
}

/**
 * Talerze na jedną stronę gryfu. inventory: ciężar talerza (tekst) -> liczba par.
 * Jeśli dokładnie się nie da, zwraca największy możliwy ciężar poniżej celu.
 */
export function platesFor(target_kg: number, bar_kg: number, inventory: Record<string, number>): PlateLoad {
  const need = Math.floor((grams(target_kg) - grams(bar_kg)) / 2);
  if (need <= 0) return { per_side: [], total_kg: r2(bar_kg), exact: grams(target_kg) === grams(bar_kg) };

  const plates = Object.entries(inventory)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => [grams(parseFloat(k)), n] as const)
    .sort((a, b) => b[0] - a[0]);
  let bestSum = -1;
  let best: number[] = [];
  const combo: number[] = [];

  const search = (i: number, remaining: number): boolean => {
    if (need - remaining > bestSum) {
      bestSum = need - remaining;
      best = [...combo];
    }
    if (remaining === 0) return true;
    if (i === plates.length) return false;
    const [weight, count] = plates[i]!;
    for (let c = Math.min(count, Math.floor(remaining / weight)); c >= 0; c--) {
      for (let k = 0; k < c; k++) combo.push(weight);
      if (search(i + 1, remaining - c * weight)) return true;
      combo.length -= c;
    }
    return false;
  };

  search(0, need);
  return { per_side: best.map((g) => g / 1000), total_kg: r2(bar_kg + (2 * bestSum) / 1000), exact: bestSum === need };
}

/** [procent ciężaru roboczego, powtórzenia] */
export const WARMUP_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0.4, 5],
  [0.6, 3],
  [0.8, 2],
];
export const HEAVY_EXTRA_STEP = [0.9, 1] as const;
export const HEAVY_FROM_KG = 100;

export interface WarmupSet {
  weight_kg: number;
  reps: number;
}

/** Serie rozgrzewkowe przed ciężarem roboczym. bar_kg = 0 dla hantli i maszyn. */
export function warmupSets(working_kg: number, bar_kg = 20, step_kg = 2.5): WarmupSet[] {
  if (working_kg <= bar_kg || working_kg <= 0) return [];
  const out: WarmupSet[] = [];
  if (bar_kg > 0) out.push({ weight_kg: r2(bar_kg), reps: 10 });
  const steps = working_kg >= HEAVY_FROM_KG ? [...WARMUP_STEPS, HEAVY_EXTRA_STEP] : WARMUP_STEPS;
  for (const [pct, reps] of steps) {
    const weight = Math.max(roundTo(working_kg * pct, step_kg), r2(bar_kg));
    const previous = out.length ? out[out.length - 1]!.weight_kg : 0;
    if (previous < weight && weight < working_kg) out.push({ weight_kg: weight, reps });
  }
  return out;
}
