/** Dwa miejsca po przecinku, połówki w górę. Identyczne z pixgym.domain.rounding.r2. */
export function r2(x: number): number {
  return Math.floor(x * 100 + 0.5) / 100;
}

/** Do najbliższej wielokrotności step (np. 2.5 kg), połówki w górę. */
export function roundTo(x: number, step: number): number {
  return r2(Math.floor(x / step + 0.5) * step);
}
