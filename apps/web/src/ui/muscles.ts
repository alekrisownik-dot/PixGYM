/**
 * Kolory partii mięśniowych (6 grup), te same w treningu, objętości i katalogu.
 * Zieleń zostaje dla akcentu aplikacji, więc partie jej nie używają.
 */

export interface MuscleGroup {
  name: string;
  color: string;
}

const GROUPS: Record<string, MuscleGroup> = {
  chest: { name: "Klatka", color: "#ff6b8a" },
  back: { name: "Plecy", color: "#5aa9ff" },
  shoulders: { name: "Barki", color: "#ffb35c" },
  arms: { name: "Ramiona", color: "#c08cff" },
  legs: { name: "Nogi", color: "#f2d65c" },
  core: { name: "Brzuch", color: "#5ee0d0" },
};

const GROUP_OF: Record<string, keyof typeof GROUPS> = {
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
