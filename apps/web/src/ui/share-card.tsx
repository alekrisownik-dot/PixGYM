import { useEffect, useState } from "react";

import { Button } from "./kit";
import { PALETTE, bitPixels, BIT_SIZE, type Mood } from "./mascot";
import { useGear } from "./gear";
import { Sheet } from "./sheet";
import { useTheme } from "./theme";

/**
 * Obrazek do pochwalenia się (1080×1350, format posta): Bit, nagłówek, duża liczba i kilka
 * wierszy. Rysowany na canvasie w kolorach bieżącego motywu, udostępniany jako plik PNG.
 */

export interface ShareCard {
  kicker: string;
  /** Kolor nagłówka i dużej liczby: akcent motywu albo bursztyn (rekord). */
  tone: "accent" | "amber";
  title: string;
  big: string;
  lines: [string, string][];
  footer: string;
  mood: Mood;
}

const W = 1080;
const H = 1350;
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Kolor z palety Bita: zamienia var(--x) na wartość z bieżącego motywu. */
function color(value: string): string {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  return m ? css(m[1]!) : value;
}

/** Skraca tekst z „…”, żeby zmieścił się w szerokości. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export async function drawCard(card: ShareCard, opts: { evil: boolean; gear: Parameters<typeof bitPixels>[0]["gear"] }): Promise<Blob> {
  await Promise.all([document.fonts.load(`700 64px ${MONO}`), document.fonts.load(`500 32px ${MONO}`)]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = css("--color-bg") || "#0a0f0d";
  const accent = css("--color-accent") || "#5cf2a0";
  const amber = css("--color-amber") || "#ffbe5c";
  const fg = css("--color-fg") || "#e4efe8";
  const muted = css("--color-muted") || "#9db1a6";
  const line = css("--color-line") || "#26362e";
  const tone = card.tone === "amber" ? amber : accent;

  // Tło: kolor motywu, siatka jak na papierze milimetrowym, poświata za Bitem.
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const glow = ctx.createRadialGradient(W / 2, 430, 40, W / 2, 430, 540);
  glow.addColorStop(0, `${tone}55`);
  glow.addColorStop(1, `${tone}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Ramka z narożnikami jak w wizjerze.
  ctx.strokeStyle = tone;
  ctx.lineWidth = 10;
  const c = 70;
  const m = 48;
  for (const [x, y, dx, dy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * c);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * c, y);
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";
  ctx.font = `600 30px ${MONO}`;
  ctx.fillStyle = muted;
  ctx.fillText("PIXGYM", 96, 130);
  ctx.textAlign = "right";
  ctx.fillText(card.kicker, W - 96, 130);
  ctx.textAlign = "left";

  // Bit: 20×21 pikseli po 22 px.
  const px = 22;
  const bx = (W - BIT_SIZE.w * px) / 2;
  const by = 200;
  for (const [x, y, k] of bitPixels({ mood: card.mood, evil: opts.evil, gear: opts.gear })) {
    ctx.fillStyle = color(PALETTE[k]!);
    ctx.fillRect(bx + x * px, by + y * px, px + 0.5, px + 0.5);
  }

  let y = by + BIT_SIZE.h * px + 110;
  ctx.textAlign = "center";
  ctx.fillStyle = tone;
  ctx.font = `700 46px ${MONO}`;
  ctx.fillText(fit(ctx, card.title.toUpperCase(), W - 200), W / 2, y);
  y += 120;
  ctx.font = `700 120px ${MONO}`;
  ctx.fillStyle = fg;
  ctx.fillText(fit(ctx, card.big, W - 200), W / 2, y);
  y += 80;

  ctx.font = `500 34px ${MONO}`;
  for (const [label, value] of card.lines.slice(0, 3)) {
    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    const v = value;
    ctx.font = `700 34px ${MONO}`;
    const vw = ctx.measureText(v).width;
    ctx.font = `500 34px ${MONO}`;
    ctx.fillText(fit(ctx, label, W - 220 - vw - 30), 110, y);
    ctx.textAlign = "right";
    ctx.fillStyle = tone;
    ctx.font = `700 34px ${MONO}`;
    ctx.fillText(v, W - 110, y);
    ctx.font = `500 34px ${MONO}`;
    y += 58;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = `500 28px ${MONO}`;
  ctx.fillText(card.footer, W / 2, H - 92);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

/** Podgląd obrazka i udostępnienie (Android: menu „Udostępnij”; inaczej pobranie pliku). */
export function ShareSheet({ card, fileName, onClose }: { card: ShareCard; fileName: string; onClose: () => void }) {
  const evil = useTheme() === "red";
  const gear = useGear();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    let made: string | null = null;
    void drawCard(card, { evil, gear }).then((b) => {
      if (gone) return;
      made = URL.createObjectURL(b);
      setBlob(b);
      setUrl(made);
    });
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [card, evil, gear]);

  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
  const canShare = !!file && !!navigator.canShare?.({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
    } catch {
      /* zamknięte menu udostępniania */
    }
  }

  return (
    <Sheet title="Pochwal się" onClose={onClose}>
      <div className="grid gap-3">
        <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
          {url ? <img src={url} alt="obrazek do udostępnienia" className="w-full" /> : <div className="aspect-[4/5] animate-pulse" />}
        </div>
        {canShare && (
          <Button onClick={() => void share()} disabled={!file}>
            📤 Udostępnij
          </Button>
        )}
        {url && (
          <a href={url} download={fileName} className={`grid min-h-12 place-items-center rounded-xl border font-mono font-semibold ${canShare ? "border-line" : "border-accent bg-accent text-accent-ink"}`}>
            ⬇ Zapisz obrazek
          </a>
        )}
      </div>
    </Sheet>
  );
}
