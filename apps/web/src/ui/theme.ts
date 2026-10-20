import { useSyncExternalStore } from "react";

/**
 * Motyw na tym telefonie: zielony (Bit) albo czerwony („Red Team”: zły Bit i glitche).
 * Zapisany w localStorage, ustawiany na <html data-theme>, żeby CSS mógł podmienić kolory.
 */

export type Theme = "green" | "red";

const KEY = "pixgym_theme";
const META: Record<Theme, string> = { green: "#0a0f0d", red: "#0e0909" };
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "red" ? "red" : "green";
  } catch {
    return "green";
  }
}

let current: Theme = read();

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META[t]);
}

apply(current);

export function setTheme(t: Theme) {
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* tryb prywatny: motyw do zamknięcia karty */
  }
  apply(t);
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Bieżący motyw poza renderem (np. treść powiadomienia). */
export const getTheme = (): Theme => current;

/** Do kodu poza Reactem (np. tło na canvasie). */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
