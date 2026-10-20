import { useEffect, useRef } from "react";

import { onThemeChange } from "./theme";

/**
 * Tło: ledwo widoczne „hakerskie” bloczki (piksele i cyfry 0/1), które wypływają z prawego
 * górnego rogu, dryfują po skosie w dół i gasną. Canvas za całą aplikacją, bez klikania.
 * Przy „ogranicz ruch” rysujemy jedną nieruchomą klatkę; w tle karty (ukryta) nic nie liczymy.
 */

interface Block {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  ttl: number;
  glyph: string | null;
  amber: boolean;
}

const COUNT = 46;
const FPS = 30;

function spawn(w: number, h: number, scatter: boolean): Block {
  // Start przy prawym górnym rogu (z rozrzutem), kierunek: w lewo i w dół.
  const fromTop = Math.random() < 0.5;
  const x = fromTop ? w * (0.55 + Math.random() * 0.5) : w + 10;
  const y = fromTop ? -10 : h * Math.random() * 0.45;
  const speed = 6 + Math.random() * 16; // px/s
  const angle = Math.PI * (0.62 + Math.random() * 0.16); // ~110–140°: w lewo-dół
  const ttl = 9 + Math.random() * 10;
  const glyph = Math.random() < 0.22 ? (Math.random() < 0.5 ? "0" : "1") : null;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: glyph ? 11 : [3, 4, 5, 6, 8, 10][Math.floor(Math.random() * 6)]!,
    alpha: 0.05 + Math.random() * 0.13,
    life: scatter ? Math.random() * ttl : 0,
    ttl,
    glyph,
    amber: Math.random() < 0.07,
  };
}

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let accent = "#5cf2a0";
    let amber = "#ffbe5c";
    let red = false;
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      accent = css.getPropertyValue("--color-accent").trim() || accent;
      amber = css.getPropertyValue("--color-amber").trim() || amber;
      red = document.documentElement.dataset.theme === "red";
    };
    readColors();
    // Motyw czerwony: co kilka sekund krótki „glitch” z poziomych pasków.
    let glitchUntil = 0;
    let nextGlitch = performance.now() + 3000;
    let bars: { y: number; h: number; x: number; w: number; cyan: boolean }[] = [];
    let w = 0;
    let h = 0;
    let blocks: Block[] = [];

    const resize = () => {
      // Pełna rozdzielczość nie jest potrzebna: bloczki i tak są pikselowe.
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    blocks = Array.from({ length: COUNT }, () => {
      const b = spawn(w, h, true);
      // Na starcie rozrzucamy je po trasie, żeby tło nie było puste.
      b.x += b.vx * b.life;
      b.y += b.vy * b.life;
      return b;
    });

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = "600 11px 'IBM Plex Mono', monospace";
      for (const b of blocks) {
        // Jaśnieje na początku, gaśnie pod koniec życia i dalej od rogu.
        const t = b.life / b.ttl;
        const fade = Math.min(1, t * 4) * (1 - t);
        const dist = Math.hypot(w - b.x, b.y) / Math.hypot(w, h);
        ctx.globalAlpha = Math.max(0, b.alpha * fade * (1.15 - dist));
        ctx.fillStyle = b.amber ? amber : accent;
        const x = Math.round(b.x);
        const y = Math.round(b.y);
        // W czerwonym motywie bloczki czasem drgają w bok.
        const jx = red && Math.random() < 0.03 ? (Math.random() - 0.5) * 14 : 0;
        if (b.glyph) ctx.fillText(b.glyph, x + jx, y);
        else ctx.fillRect(x + jx, y, b.size, b.size);
      }
      if (red && performance.now() < glitchUntil) {
        for (const g of bars) {
          ctx.globalAlpha = 0.09;
          ctx.fillStyle = g.cyan ? "#00e5ff" : accent;
          ctx.fillRect(g.x, g.y, g.w, g.h);
        }
      }
      ctx.globalAlpha = 1;
    };

    if (reduce) {
      draw();
      const redraw = () => {
        readColors();
        draw();
      };
      window.addEventListener("resize", resize);
      const offTheme = onThemeChange(redraw);
      return () => {
        window.removeEventListener("resize", resize);
        offTheme();
      };
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc < 1 / FPS) return;
      for (const b of blocks) {
        b.life += acc;
        b.x += b.vx * acc;
        b.y += b.vy * acc;
        if (b.life >= b.ttl || b.x < -20 || b.y > h + 20) Object.assign(b, spawn(w, h, false));
      }
      acc = 0;
      if (red && now > nextGlitch) {
        glitchUntil = now + 90 + Math.random() * 160;
        nextGlitch = now + 3500 + Math.random() * 6000;
        bars = Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => {
          const wBar = w * (0.3 + Math.random() * 0.7);
          return { y: Math.random() * h, h: 2 + Math.random() * 12, x: Math.random() * (w - wBar), w: wBar, cyan: Math.random() < 0.4 };
        });
      }
      draw();
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible") {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    const offTheme = onThemeChange(readColors);
    return () => {
      offTheme();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
