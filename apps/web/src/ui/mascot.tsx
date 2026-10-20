import type { ReactNode } from "react";

import { useTheme } from "./theme";

/**
 * Bit: maskotka PixGYM. Piksel-art 20×21 składany z części (głowa, twarz, tułów),
 * żeby każdy nastrój nie wymagał rysowania całej postaci od nowa.
 */

export type Mood = "idle" | "flex" | "sleep" | "lift";

export const PALETTE: Record<string, string> = {
  G: "var(--color-accent)",
  g: "var(--color-accent-dark)",
  K: "#06140d",
  W: "var(--bit-eye)",
  A: "var(--color-amber)",
  M: "#7e8f86",
  m: "#c9d6cf",
};

const W = 20;
const H = 21;

// Głowa-monitor 14×10, ekran (K) w kolumnach 2–11, wierszach 2–7.
const HEAD = [
  ".GGGGGGGGGGGG.",
  "GGGGGGGGGGGGGG",
  "GGKKKKKKKKKKGG",
  "GGKKKKKKKKKKGG",
  "GGKKKKKKKKKKGG",
  "GGKKKKKKKKKKGG",
  "GGKKKKKKKKKKGG",
  "GGKKKKKKKKKKGG",
  "GGGGGGGGGGGGGG",
  ".gggggggggggg.",
];
const HEAD_X = 3;
const HEAD_Y = 4;

type Px = readonly [x: number, y: number, c: string];

// Twarze we współrzędnych głowy.
const EYES_OPEN: Px[] = [3, 4, 9, 10].flatMap((x) => [[x, 3, "W"], [x, 4, "W"]] as Px[]);
const EYES_HAPPY: Px[] = [
  [3, 4, "W"], [4, 3, "W"], [5, 4, "W"],
  [8, 4, "W"], [9, 3, "W"], [10, 4, "W"],
];
const EYES_CLOSED: Px[] = [3, 4, 9, 10].map((x) => [x, 4, "W"] as Px);
const EYES_FOCUS: Px[] = [...EYES_CLOSED, [3, 3, "W"], [10, 3, "W"]];
const SMILE: Px[] = [[4, 6, "W"], [9, 6, "W"], [5, 7, "W"], [6, 7, "W"], [7, 7, "W"], [8, 7, "W"]];
const GRIN: Px[] = [4, 5, 6, 7, 8, 9].map((x) => [x, 6, "W"] as Px).concat([5, 6, 7, 8].map((x) => [x, 7, "A"] as Px));
const SNOOZE: Px[] = [[6, 7, "W"], [7, 7, "W"]];
const FLAT: Px[] = [5, 6, 7, 8].map((x) => [x, 7, "W"]);
const BLUSH: Px[] = [[2, 5, "A"], [11, 5, "A"]];

function rows(lines: string[]): Px[] {
  return lines.flatMap((line, y) => [...line].flatMap((c, x) => (c === "." ? [] : [[x, y, c] as Px])));
}

const ANTENNA: Px[] = [[9, 2, "A"], [10, 2, "A"], [9, 3, "g"], [10, 3, "g"]];

// Zły Bit (motyw czerwony): rogi zamiast anteny, wściekłe oczy, uśmiech z kłami.
const HORNS: Px[] = [[5, 3, "G"], [4, 3, "G"], [4, 2, "G"], [3, 1, "G"], [14, 3, "G"], [15, 3, "G"], [15, 2, "G"], [16, 1, "G"]];
const EYES_EVIL: Px[] = [[3, 3, "W"], [3, 4, "W"], [4, 4, "W"], [5, 4, "W"], [10, 3, "W"], [10, 4, "W"], [9, 4, "W"], [8, 4, "W"]];
const FANGS: Px[] = [3, 4, 5, 6, 7, 8, 9, 10].map((x) => [x, 6, "W"] as Px).concat([[4, 7, "W"], [9, 7, "W"]] as Px[]);
const isAntenna = ([x, y]: Px) => (x === 9 || x === 10) && (y === 2 || y === 3);

const BODY_IDLE = rows([
  ...Array<string>(14).fill(""),
  "......GGGGGGGG......",
  "....ggGGGGGGGGgg....",
  "....g.GGGGGGGG.g....",
  "....g.GGGGGGGG.g....",
  "......gggggggg......",
  "......GG....GG......",
  "......gg....gg......",
]);

// Ręce w górze ze sztangą nad głową.
const BODY_FLEX = rows([
  "MM................MM",
  "MMmmmmmmmmmmmmmmmmMM",
  "MMg..............gMM",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..g..............g..",
  "..ggggGGGGGGGGgggg..",
  "......GGGGGGGG......",
  "......GGGGGGGG......",
  "......GGGGGGGG......",
  "......gggggggg......",
  "......GG....GG......",
  "......gg....gg......",
]);

// Hantel w prawej ręce, opuszczony.
const BODY_LIFT = rows([
  ...Array<string>(14).fill(""),
  "......GGGGGGGG......",
  "....ggGGGGGGGGgg....",
  "....g.GGGGGGGG.g....",
  "....g.GGGGGGGG.gM.M.",
  "......gggggggg.mmmm.",
  "......GG....GG..M.M.",
  "......gg....gg......",
]);

const ZZZ = rows(["..............WWW...", "...............W....", "..............WWW..."]);

interface Parts {
  body: Px[];
  eyes: Px[];
  mouth: Px[];
  extra?: Px[];
  zzz?: boolean;
}

const MOODS: Record<Mood, Parts> = {
  idle: { body: [...ANTENNA, ...BODY_IDLE], eyes: EYES_OPEN, mouth: SMILE },
  flex: { body: BODY_FLEX, eyes: EYES_HAPPY, mouth: GRIN, extra: BLUSH },
  sleep: { body: [...ANTENNA, ...BODY_IDLE], eyes: EYES_CLOSED, mouth: SNOOZE, zzz: true },
  lift: { body: [...ANTENNA, ...BODY_LIFT], eyes: EYES_FOCUS, mouth: FLAT },
};

function Pixels({ px, dx = 0, dy = 0, className }: { px: Px[]; dx?: number; dy?: number; className?: string }) {
  return (
    <g className={className}>
      {px.map(([x, y, c], i) => (
        <rect key={i} x={x + dx} y={y + dy} width={1.02} height={1.02} fill={PALETTE[c]} />
      ))}
    </g>
  );
}

export function Bit({ mood = "idle", size = 64, className = "", evil: forced }: { mood?: Mood; size?: number; className?: string; evil?: boolean }) {
  const theme = useTheme();
  const evil = forced ?? theme === "red";
  const base = MOODS[mood];
  const m: Parts = evil
    ? {
        ...base,
        body: [...base.body.filter((p) => !isAntenna(p)), ...HORNS],
        eyes: mood === "sleep" ? base.eyes : EYES_EVIL,
        mouth: FANGS,
        extra: undefined,
      }
    : base;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={(size * H) / W}
      shapeRendering="crispEdges"
      className={`bit bit-${mood} shrink-0 ${className}`}
      role="img"
      aria-label={evil ? "Zły Bit, pentester z Red Teamu" : "Bit, maskotka PixGYM"}
    >
      <Pixels px={m.body} />
      <Pixels px={rows(HEAD)} dx={HEAD_X} dy={HEAD_Y} />
      <Pixels px={m.eyes} dx={HEAD_X} dy={HEAD_Y} className="bit-eyes" />
      <Pixels px={m.mouth} dx={HEAD_X} dy={HEAD_Y} />
      {m.extra && <Pixels px={m.extra} dx={HEAD_X} dy={HEAD_Y} />}
      {m.zzz && <Pixels px={ZZZ} className="bit-z" />}
    </svg>
  );
}

/** Bit z dymkiem. Dymek trzyma krótki komunikat i opcjonalnie dodatki (np. liczniki). */
export function BitSays({
  mood = "idle",
  children,
  footer,
  size = 72,
  onBitClick,
}: {
  mood?: Mood;
  children: ReactNode;
  footer?: ReactNode;
  size?: number;
  /** Dotknięcie Bita (np. kolejny żart). */
  onBitClick?: () => void;
}) {
  return (
    <div className="flex items-end gap-2">
      {onBitClick ? (
        <button onClick={onBitClick} className="shrink-0 active:scale-95" aria-label="Dotknij Bita">
          <Bit mood={mood} size={size} />
        </button>
      ) : (
        <Bit mood={mood} size={size} />
      )}
      <div className="bubble card relative mb-3 min-w-0 flex-1 px-3.5 py-2.5">
        <div className="text-[15px] leading-snug">{children}</div>
        {footer && <div className="mt-1.5">{footer}</div>}
      </div>
    </div>
  );
}

/** Bit wychylający się zza prawej krawędzi ekranu (nad dolnym menu), z krótkim dymkiem. */
export function BitPeek({ children, onClick, label }: { children?: ReactNode; onClick: () => void; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-10 mx-auto flex max-w-xl items-end justify-end overflow-hidden pt-16">
      {children && (
        <button onClick={onClick} className="bubble-r card pop pointer-events-auto relative mr-1 mb-12 max-w-[60%] px-3.5 py-2.5 text-left text-[15px] leading-snug">
          {children}
        </button>
      )}
      <button onClick={onClick} className="bit-peek pointer-events-auto -mr-7 shrink-0" aria-label={label}>
        <Bit mood="idle" size={92} />
      </button>
    </div>
  );
}
