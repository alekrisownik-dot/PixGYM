import type { Block, LastPerformance } from "../api";
import { doubleProgression, linearProgression, rpeTarget, type Params, type SetTarget } from "../domain";

/** Reguła progresji z /progression-rules. */
export interface Rule {
  id: string;
  slug: string | null;
  name: string;
  type: string;
  params: Params;
}

export interface Suggestion {
  /** Cel na każdą serię roboczą (ciężar łączny). */
  sets: SetTarget[];
  /** Zmiana ciężaru względem ostatniego treningu (kg). */
  change: number;
  reason: string;
}

/**
 * Podpowiedź ciężaru na dziś z ostatniego treningu i reguły z planu (podwójna, liniowa, RPE).
 * Schematy procentowe (5/3/1, nSuns, GZCLP) potrzebują training max, więc ich tu nie liczymy.
 */
export function suggest(target: Block | null | undefined, last: LastPerformance | null | undefined, rule: Rule | undefined, isLower: boolean): Suggestion | null {
  if (!target || target.set_scheme?.length || !last) return null;
  const working = last.sets.filter((s) => s.set_type !== "warmup" && s.weight_kg != null && s.reps != null);
  if (!working.length) return null;
  const top = Math.max(...working.map((s) => s.weight_kg!));
  const perf = { weight_kg: top, reps: working.filter((s) => s.weight_kg === top).map((s) => s.reps!) };
  const params = rule?.params ?? {};
  const repMin = target.rep_min ?? 8;

  let sets: SetTarget[] | null = null;
  switch (rule?.type ?? "double") {
    case "double":
      sets = doubleProgression(params, perf, target.target_sets, repMin, target.rep_max, isLower);
      break;
    case "linear":
      sets = linearProgression(params, [perf], target.target_sets, repMin, isLower);
      break;
    case "rpe": {
      const e1rm = Math.max(0, ...working.map((s) => s.e1rm_kg ?? 0));
      if (target.target_rpe && e1rm) sets = rpeTarget(params, e1rm, target.target_sets, repMin, target.rep_max, target.target_rpe);
      break;
    }
  }
  const first = sets?.[0];
  if (!sets || !first || first.weight_kg == null) return null;
  const change = Math.round((first.weight_kg - top) * 100) / 100;
  const done = `${perf.reps.length}×${Math.min(...perf.reps)}${perf.reps.some((r) => r !== perf.reps[0]) ? "+" : ""}`;
  const reason =
    change > 0
      ? `Ostatnio ${done} na ${top} kg: czas na +${change} kg.`
      : change < 0
        ? `Kilka razy nie wyszło na ${top} kg: lżej o ${-change} kg i znów w górę.`
        : `Zostań przy ${top} kg i dorzuć powtórzenie.`;
  return { sets, change, reason };
}
