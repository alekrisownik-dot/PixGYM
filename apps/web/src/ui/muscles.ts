/**
 * Kolory partii mięśniowych (6 grup), te same w treningu, objętości i katalogu.
 * Zieleń zostaje dla akcentu aplikacji, więc partie jej nie używają.
 */

export type GroupKey = "chest" | "back" | "shoulders" | "arms" | "legs" | "core";

export interface MuscleGroup {
  key: GroupKey;
  name: string;
  color: string;
}

const GROUPS: Record<GroupKey, MuscleGroup> = {
  chest: { key: "chest", name: "Klatka", color: "#ff6b8a" },
  back: { key: "back", name: "Plecy", color: "#5aa9ff" },
  shoulders: { key: "shoulders", name: "Barki", color: "#ffb35c" },
  arms: { key: "arms", name: "Ręce", color: "#c08cff" },
  legs: { key: "legs", name: "Nogi", color: "#f2d65c" },
  core: { key: "core", name: "Brzuch", color: "#5ee0d0" },
};

const GROUP_OF: Record<string, GroupKey> = {
  chest: "chest",
  lats: "back",
  upper_back: "back",
  traps: "back",
  lower_back: "back",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
  quads: "legs",
  hamstrings: "legs",
  glutes: "legs",
  adductors: "legs",
  abductors: "legs",
  calves: "legs",
  abs: "core",
  obliques: "core",
};

/** Grupa dla sluga partii (np. „lats” → Plecy); nieznana partia: brak koloru. */
export function muscleGroup(slug: string | null | undefined): MuscleGroup | null {
  const g = slug ? GROUP_OF[slug] : undefined;
  return g ? GROUPS[g]! : null;
}

/** Ikonka dnia planu: partia albo całe ciało. */
export type DayIcon = GroupKey | "full";

export const DAY_ICONS: { key: DayIcon; name: string; color: string }[] = [
  ...Object.values(GROUPS).map((g) => (g.key === "chest" ? { ...g, name: "Klata" } : g)),
  { key: "full", name: "Całe ciało", color: "var(--color-accent)" },
];

export const dayIconInfo = (icon: DayIcon) => DAY_ICONS.find((d) => d.key === icon)!;

/**
 * Ikonka dobrana z ćwiczeń dnia: partia z największą liczbą ćwiczeń. Dzień z nogami i górą,
 * w którym żadna partia nie przeważa (najczęstsza poniżej 40%), to całe ciało. Bez ćwiczeń: brak.
 */
export function autoDayIcon(slugs: (string | null | undefined)[]): DayIcon | null {
  const count = new Map<GroupKey, number>();
  for (const s of slugs) {
    const g = muscleGroup(s);
    if (g) count.set(g.key, (count.get(g.key) ?? 0) + 1);
  }
  const total = [...count.values()].reduce((a, b) => a + b, 0);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const mixed = count.has("legs") && count.size >= 3 && top[1] / total < 0.4;
  return mixed ? "full" : top[0];
}
