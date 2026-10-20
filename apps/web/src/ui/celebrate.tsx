import { useEffect, useState, type CSSProperties } from "react";

import { Bit } from "./mascot";
import { quipOfDay } from "./quips";
import { useTheme } from "./theme";

/** Nowy rekord: pełny ekran z Bitem, licznikiem i wybuchem pikseli. Znika sam albo po dotknięciu. */

export interface Record {
  exercise: string;
  /** Np. „1RM szac.”, „5RM”. */
  label: string;
  value: number;
  unit: string;
}

const EVENT = "pixgym:pr";
const CLOSE_MS = 4500;

export function celebrate(r: Record) {
  window.dispatchEvent(new CustomEvent<Record>(EVENT, { detail: r }));
}

const BURST = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * Math.PI * 2 + (i % 2) * 0.2;
  const r = 110 + (i % 4) * 34;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), c: i % 3 === 0 ? "var(--color-amber)" : i % 5 === 0 ? "#00e5ff" : "var(--color-accent)", s: 8 + (i % 3) * 4 };
});

/** Liczba rośnie od zera do wartości (ok. 0,9 s). */
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Overlay({ r, onClose }: { r: Record; onClose: () => void }) {
  const evil = useTheme() === "red";
  const v = useCountUp(r.value);
  useEffect(() => {
    navigator.vibrate?.([60, 40, 120]);
    const t = setTimeout(onClose, CLOSE_MS);
    return () => clearTimeout(t);
  }, [onClose]);
  const shown = Number.isInteger(r.value) ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "");

  return (
    <div className="pr-in fixed inset-0 z-[70] grid place-items-center bg-bg/90 px-6 backdrop-blur-sm" onClick={onClose} role="alertdialog" aria-label={`Nowy rekord: ${r.exercise}, ${r.label} ${r.value} ${r.unit}`}>
      <div className="relative grid justify-items-center gap-3 text-center">
        {BURST.map((p, k) => (
          <span
            key={k}
            className="loop-pixel absolute top-1/3 left-1/2"
            style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, width: p.s, height: p.s, background: p.c, animationDuration: "1.1s" } as CSSProperties}
          />
        ))}
        <p className="pr-title font-mono text-[52px] leading-none font-bold tracking-tight text-accent">NEW PR</p>
        <Bit mood="flex" size={150} />
        <p className="max-w-xs text-[19px] font-semibold">{r.exercise}</p>
        <p className="num text-[44px] leading-none font-bold text-amber">
          {shown}
          <span className="ml-1 text-[22px] text-amber/80">{r.unit}</span>
        </p>
        <p className="font-mono text-[13px] tracking-wider text-muted uppercase">{r.label}</p>
        {evil && <p className="max-w-xs font-mono text-[13px] text-fg/80">{quipOfDay(3)}</p>}
        <p className="mt-2 font-mono text-[12px] text-muted">dotknij, żeby wrócić</p>
      </div>
    </div>
  );
}

export function Celebrations() {
  const [r, setR] = useState<Record | null>(null);
  useEffect(() => {
    const on = (e: Event) => setR((e as CustomEvent<Record>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return r ? <Overlay key={`${r.exercise}-${r.value}`} r={r} onClose={() => setR(null)} /> : null;
}
