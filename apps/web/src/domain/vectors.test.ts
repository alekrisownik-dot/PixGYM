import { describe, expect, it } from "vitest";
import vectors from "../../../../packages/test-vectors/strength.json";
import * as d from "./index";

type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const rules = vectors.rules as Record<string, d.Params>;
const R = (a: Args) => rules[a.rule]!;
const muscles = (m: [string, number][]) => m.map(([s, c]) => [s, c] as const);

const dispatch: Record<string, (a: Args) => unknown> = {
  estimate_1rm: (a) => d.estimate1rm(a as d.Estimate1rmArgs),
  effective_weight: (a) => d.effectiveWeight(a as d.EffectiveWeightArgs),
  record_history: (a) => d.recordHistory(a.sets),
  new_records: (a) =>
    d.newRecords(new Map(a.best.map((b: d.RecordValue) => [d.recordKey(b.record_type, b.reps), b.value])), a.set),
  is_hard_set: (a) => d.isHardSet(a.set_type, a.rpe, a.rir),
  muscle_volume: (a) => d.muscleVolume(a.sets.map((s: Args) => ({ ...s, muscles: muscles(s.muscles) }))),
  plates_for: (a) => d.platesFor(a.target_kg, a.bar_kg, a.inventory),
  warmup_sets: (a) => d.warmupSets(a.working_kg, a.bar_kg, a.step_kg),
  double_progression: (a) => d.doubleProgression(R(a), a.last, a.target_sets, a.rep_min, a.rep_max, a.is_lower),
  linear_progression: (a) => d.linearProgression(R(a), a.history, a.target_sets, a.reps, a.is_lower),
  rpe_target: (a) => d.rpeTarget(R(a), a.e1rm_kg, a.target_sets, a.rep_min, a.rep_max, a.target_rpe),
  training_max: (a) => d.trainingMax(R(a), a.e1rm_kg),
  wendler_sets: (a) => d.wendlerSets(R(a), a.tm_kg, a.week),
  wendler_next_tm: (a) => d.wendlerNextTm(R(a), a.tm_kg, a.is_lower),
  nsuns_next_tm: (a) => d.nsunsNextTm(R(a), a.tm_kg, a.amrap_reps, a.is_lower),
  scheme_sets: (a) => d.schemeSets(a.scheme, a.tm_kg),
  gzclp_next: (a) => d.gzclpNext(R(a), a.state, a.is_lower, a.success, a.amrap_reps),
  gzclp_sets: (a) => d.gzclpSets(R(a), a.state),
  rank_table: () => d.rankTable(),
  rank_for: (a) => d.rankFor(a.lift, a.e1rm_kg, a.bodyweight_kg, a.sex),
  dots: (a) => d.dots(a.lift_kg, a.bodyweight_kg, a.sex),
  rank_positions: (a) => d.rankPositions(a.entries),
};

const groups = Object.entries(vectors).filter(([fn]) => fn !== "rules") as [
  string,
  { name: string; args: Args; expected: unknown }[],
][];

it("każda funkcja z wektorów ma implementację", () => {
  expect(groups.map(([fn]) => fn).sort()).toEqual(Object.keys(dispatch).sort());
});

for (const [fn, cases] of groups) {
  describe(fn, () => {
    for (const c of cases) {
      it(c.name, () => {
        expect(dispatch[fn]!(c.args)).toEqual(c.expected);
      });
    }
  });
}
