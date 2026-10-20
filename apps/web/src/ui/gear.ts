import { useSyncExternalStore } from "react";

/**
 * Akcesoria Bita za odznaki. Trzy miejsca (głowa, twarz, szyja), po jednym przedmiocie.
 * Wybór trzymamy na tym telefonie (localStorage); odblokowanie wynika z odznak z serwera.
 */

export type Slot = "head" | "face" | "neck";
export type GearId = "headband" | "headphones" | "crown" | "shades" | "chain";
export type Gear = Partial<Record<Slot, GearId>>;

export const GEAR: ReadonlyArray<{ id: GearId; slot: Slot; name: string; badge: string; badgeName: string }> = [
  { id: "headband", slot: "head", name: "Opaska", badge: "first_blood", badgeName: "First Blood" },
  { id: "headphones", slot: "head", name: "Słuchawki", badge: "brute_force", badgeName: "Brute Force" },
  { id: "crown", slot: "head", name: "Korona", badge: "sudo", badgeName: "sudo su" },
  { id: "shades", slot: "face", name: "Okulary", badge: "uptime_30d", badgeName: "Uptime 30d" },
  { id: "chain", slot: "neck", name: "Łańcuch", badge: "ddos", badgeName: "DDoS" },
];

const KEY = "pixgym_bit_gear";
const listeners = new Set<() => void>();

function read(): Gear {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Gear;
  } catch {
    return {};
  }
}

let current: Gear = read();

export function setGear(g: Gear) {
  current = g;
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* tryb prywatny */
  }
  listeners.forEach((l) => l());
}

/** Załóż albo zdejmij (to samo miejsce: poprzedni przedmiot schodzi). */
export function toggleGear(id: GearId) {
  const item = GEAR.find((x) => x.id === id)!;
  setGear({ ...current, [item.slot]: current[item.slot] === id ? undefined : id });
}

export function useGear(): Gear {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
