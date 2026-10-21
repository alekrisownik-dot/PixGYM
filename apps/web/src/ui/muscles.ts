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

/** Ikonka dnia planu: partia (split), push / pull / góra albo całe ciało. */
export type DayIcon = GroupKey | "push" | "pull" | "upper" | "full";

export const DAY_ICONS: { key: DayIcon; name: string; color: string }[] = [
  { key: "push", name: "Push", color: GROUPS.chest.color },
  { key: "pull", name: "Pull", color: GROUPS.back.color },
  { key: "upper", name: "Góra", color: GROUPS.shoulders.color },
  ...Object.values(GROUPS).map((g) => (g.key === "chest" ? { ...g, name: "Klata" } : g)),
  { key: "full", name: "Całe ciało", color: "var(--color-accent)" },
];

export const dayIconInfo = (icon: DayIcon) => DAY_ICONS.find((d) => d.key === icon)!;

// Ruchy pchające i ciągnące (tył barków i przedramiona do ciągnięcia, jak w typowym PPL).
const PUSH = new Set(["chest", "front_delts", "side_delts", "triceps"]);
const PULL = new Set(["lats", "upper_back", "traps", "lower_back", "rear_delts", "biceps", "forearms"]);

/**
 * Ikonka dobrana z ćwiczeń dnia. Jedna partia z przewagą (co najmniej 60% ćwiczeń) to split na nią.
 * Inaczej: nogi z górą to całe ciało, sama góra to push, pull albo góra (gdy jest i to, i to;
 * pojedyncze ćwiczenie z drugiej strony nie psuje push/pull). Bez ćwiczeń: brak.
 */
export function autoDayIcon(slugs: (string | null | undefined)[]): DayIcon | null {
  const count = new Map<GroupKey, number>();
  let push = 0;
  let pull = 0;
  for (const s of slugs) {
    const g = muscleGroup(s);
    if (!g) continue;
    count.set(g.key, (count.get(g.key) ?? 0) + 1);
    if (PUSH.has(s!)) push++;
    if (PULL.has(s!)) pull++;
  }
  const total = [...count.values()].reduce((a, b) => a + b, 0);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  if (top[1] / total >= 0.6) return top[0];
  const upper = push + pull;
  if (count.has("legs")) return upper > 0 ? "full" : top[0];
  if (upper === 0) return top[0];
  if (pull / upper <= 0.2) return "push";
  if (push / upper <= 0.2) return "pull";
  return "upper";
}
