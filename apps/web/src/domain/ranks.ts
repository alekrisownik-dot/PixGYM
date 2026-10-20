/** Rangi siłowe z tytułami ze świata hakowania, DOTS i kolejność w rankingu. Lustro pixgym.domain.ranks. */
import { r2 } from "./rounding";

export const TITLES = [
  "Script Kiddie",
  "Packet Sniffer",
  "Firewall Breaker",
  "Exploit Dev",
  "Black Hat",
  "Root Access",
  "Zero-Day",
  "Kernel Panic",
] as const;

export type Sex = "male" | "female";

export interface RankedLift {
  slug: string;
  name: string;
  /** Szacowany 1RM / masa ciała potrzebny do rang 2..8 (ranga 1 od zera). */
  thresholds: readonly number[];
  /** Przy ćwiczeniach z masą ciała 1.0 = jedno czyste powtórzenie; progi kobiet skalujemy powyżej bazy. */
  base: number;
  female_factor: number;
}

export const RANKED_LIFTS: Record<string, RankedLift> = Object.fromEntries(
  (
    [
      { slug: "bench_press", name: "Wyciskanie leżąc", thresholds: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0], base: 0, female_factor: 0.65 },
      { slug: "pull_up", name: "Podciąganie", thresholds: [1.0, 1.15, 1.3, 1.45, 1.6, 1.8, 2.0], base: 1, female_factor: 0.6 },
      { slug: "dip", name: "Pompki na poręczach", thresholds: [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.3], base: 1, female_factor: 0.6 },
      { slug: "concentration_curl", name: "Uginanie w koncentracji", thresholds: [0.1, 0.15, 0.2, 0.27, 0.35, 0.45, 0.55], base: 0, female_factor: 0.65 },
    ] satisfies RankedLift[]
  ).map((l) => [l.slug, l]),
);

/** Progi jako krotność masy ciała. Bez podanej płci: progi męskie. */
export function thresholdsFor(lift: RankedLift, sex: Sex | null | undefined): number[] {
  if (sex !== "female") return [...lift.thresholds];
  return lift.thresholds.map((t) => (t > lift.base ? r2(lift.base + (t - lift.base) * lift.female_factor) : t));
}

export interface Rank {
  tier: number;
  title: string;
  ratio: number;
  next_title: string | null;
  next_at_kg: number | null;
  progress: number;
}

/** Ranga dla boju albo null, gdy brak wyniku lub masy ciała. */
export function rankFor(
  liftSlug: string,
  e1rmKg: number | null,
  bodyweightKg: number | null,
  sex: Sex | null | undefined,
): Rank | null {
  const lift = RANKED_LIFTS[liftSlug]!;
  if (e1rmKg == null || !bodyweightKg) return null;
  const limits = thresholdsFor(lift, sex).map((t) => r2(t * bodyweightKg));
  const tier = limits.filter((kg) => e1rmKg >= kg).length;
  const ratio = r2(e1rmKg / bodyweightKg);
  if (tier === limits.length) {
    return { tier, title: TITLES[tier]!, ratio, next_title: null, next_at_kg: null, progress: 1.0 };
  }
  const low = tier > 0 ? limits[tier - 1]! : 0;
  const high = limits[tier]!;
  // W dół: pasek pełny dopiero po faktycznym awansie.
  const progress = Math.floor(Math.max(0, Math.min(1, (e1rmKg - low) / (high - low))) * 100) / 100;
  return { tier, title: TITLES[tier]!, ratio, next_title: TITLES[tier + 1]!, next_at_kg: high, progress };
}

/** Współczynniki DOTS (IPF): 500 / (a + b·m + c·m² + d·m³ + e·m⁴). */
export const DOTS_COEF: Record<Sex, readonly number[]> = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
};
export const DOTS_BW_RANGE: Record<Sex, readonly [number, number]> = { male: [40, 210], female: [40, 150] };

/** Wynik względny wobec masy ciała. Bez płci lub masy ciała: null. */
export function dots(liftKg: number | null, bodyweightKg: number | null, sex: Sex | null | undefined): number | null {
  if (liftKg == null || !bodyweightKg || (sex !== "male" && sex !== "female")) return null;
  const [lo, hi] = DOTS_BW_RANGE[sex];
  const m = Math.min(Math.max(bodyweightKg, lo), hi);
  const [a, b, c, d, e] = DOTS_COEF[sex] as [number, number, number, number, number];
  const denominator = a + b * m + c * m ** 2 + d * m ** 3 + e * m ** 4;
  return r2((liftKg * 500) / denominator);
}

export interface RankEntry {
  id: string;
  value: number | null;
  achieved_at: string;
}
export interface Placed {
  id: string;
  value: number;
  achieved_at: string;
  position: number;
}

/** Kolejność malejąco. Remis: to samo miejsce (1, 2, 2, 4), wyżej ten, kto był pierwszy. */
export function rankPositions(entries: readonly RankEntry[]): Placed[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ordered = entries
    .filter((e): e is RankEntry & { value: number } => e.value != null)
    .sort((a, b) => b.value - a.value || cmp(a.achieved_at, b.achieved_at) || cmp(a.id, b.id));
  const out: Placed[] = [];
  ordered.forEach((e, i) => {
    const prev = out[out.length - 1];
    out.push({ id: e.id, value: e.value, achieved_at: e.achieved_at, position: prev && prev.value === e.value ? prev.position : i + 1 });
  });
  return out;
}

/** Pełna konfiguracja rang. Wektory testowe pilnują, że Python ma identyczną. */
export function rankTable() {
  return Object.values(RANKED_LIFTS).map((lift) => ({
    slug: lift.slug,
    thresholds_male: thresholdsFor(lift, "male"),
    thresholds_female: thresholdsFor(lift, "female"),
    titles: [...TITLES],
  }));
}
