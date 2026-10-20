import type { Block } from "../api";

export const WEEKDAYS_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
export const WEEKDAYS_LONG = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

/** Dzień tygodnia 0 = poniedziałek (jak w bazie). */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;

export function repsText(b: Pick<Block, "rep_min" | "rep_max">): string {
  if (b.rep_min == null) return "?";
  if (b.rep_max == null) return `${b.rep_min}+`;
  return b.rep_min === b.rep_max ? `${b.rep_min}` : `${b.rep_min}–${b.rep_max}`;
}

/** „4 × 6–8 · RPE 8” albo dla schematów procentowych „9 serii wg %TM”. */
export function blockText(b: Block): string {
  if (b.set_scheme?.length) {
    const pct = b.set_scheme.some((s) => s.pct != null);
    return `${b.set_scheme.length} serii${pct ? " wg % TM" : ""}`;
  }
  return `${b.target_sets} × ${repsText(b)}${b.target_rpe ? ` · RPE ${b.target_rpe}` : ""}`;
}

export function schemeText(b: Block): string | null {
  if (!b.set_scheme?.length) return null;
  return b.set_scheme
    .map((s) => `${s.pct != null ? `${Math.round(s.pct * 100)}%×` : "×"}${s.reps}${s.amrap ? "+" : ""}`)
    .join(", ");
}
