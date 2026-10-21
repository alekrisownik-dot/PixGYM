import { useState } from "react";

import type { MuscleVolume } from "../api";

/**
 * Mapa mięśni: piksel-artowa sylwetka z przodu i z tyłu, partie świecą tym mocniej, im więcej
 * ciężkich serii w tygodniu. Litera w siatce = partia, „#” i „h” = ciało bez partii (ręce, kolana…).
 * Kolory są nieprzezroczyste: piksele lekko na siebie nachodzą, więc półprzezroczyste dawałyby paski.
 */

// Głowa jak u Bita: monitor, z przodu z oczami („y”).
const FRONT = [
  ".....hhhhhh.....",
  ".....hyhhyh.....",
  ".....hhhhhh.....",
  "......hhhh......",
  "......####......",
  "....tttttttt....",
  "..ssffccccffss..",
  "..ssffccccffss..",
  "..bb.cccccc.bb..",
  "..bb.cccccc.bb..",
  "..bb.aaaaaa.bb..",
  "..rr.oaaaao.rr..",
  "..rr.oaaaao.rr..",
  ".rr..oaaaao..rr.",
  ".##..oaaaao..##.",
  ".....######.....",
  ".....qqddqq.....",
  ".....qqddqq.....",
  ".....qqddqq.....",
  ".....qq..qq.....",
  ".....qq..qq.....",
  ".....##..##.....",
  ".....nn..nn.....",
  ".....nn..nn.....",
  ".....nn..nn.....",
  "....###..###....",
];

const BACK = [
  ".....hhhhhh.....",
  ".....hhhhhh.....",
  ".....hhhhhh.....",
  "......hhhh......",
  "......tttt......",
  "....tttttttt....",
  "..sseuttttuess..",
  "..sseuuttuuess..",
  "..xx.luuuul.xx..",
  "..xx.llwwll.xx..",
  "..xx.llwwll.xx..",
  "..rr.lwwwwl.rr..",
  "..rr..wwww..rr..",
  ".rr..pggggp..rr.",
  ".##..pggggp..##.",
  ".....gggggg.....",
  ".....mmmmmm.....",
  ".....mm..mm.....",
  ".....mm..mm.....",
  ".....mm..mm.....",
  ".....mm..mm.....",
  ".....##..##.....",
  ".....nn..nn.....",
  ".....nn..nn.....",
  ".....nn..nn.....",
  "....###..###....",
];

const CODE: Record<string, string> = {
  c: "chest",
  t: "traps",
  f: "front_delts",
  s: "side_delts",
  e: "rear_delts",
  b: "biceps",
  x: "triceps",
  r: "forearms",
  a: "abs",
  o: "obliques",
  u: "upper_back",
  l: "lats",
  w: "lower_back",
  g: "glutes",
  q: "quads",
  m: "hamstrings",
  d: "adductors",
  p: "abductors",
  n: "calves",
};

const NAMES: Record<string, string> = {
  chest: "Klatka",
  traps: "Kaptury",
  front_delts: "Przód barków",
  side_delts: "Bok barków",
  rear_delts: "Tył barków",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Przedramiona",
  abs: "Brzuch",
  obliques: "Skośne brzucha",
  upper_back: "Górne plecy",
  lats: "Najszersze",
  lower_back: "Prostowniki",
  glutes: "Pośladki",
  quads: "Czworogłowe",
  hamstrings: "Dwugłowe uda",
  adductors: "Przywodziciele",
  abductors: "Odwodziciele",
  calves: "Łydki",
};

/** Poziom: 0 nic, 1 trochę (<5), 2 coś (5–9), 3 w normie (10–20), 4 bardzo dużo (>20). */
export function level(sets: number): 0 | 1 | 2 | 3 | 4 {
  if (sets <= 0) return 0;
  if (sets < 5) return 1;
  if (sets < 10) return 2;
  return sets <= 20 ? 3 : 4;
}

const FILL = [
  "color-mix(in srgb, var(--color-fg) 9%, var(--color-surface))",
  "color-mix(in srgb, var(--color-accent) 30%, var(--color-surface-2))",
  "color-mix(in srgb, var(--color-accent) 62%, var(--color-surface-2))",
  "var(--color-accent)",
  "var(--color-amber)",
];
const LEGEND = [
  [0, "0"],
  [1, "1–4"],
  [2, "5–9"],
  [3, "10–20"],
  [4, "20+"],
] as const;
const BODY = "color-mix(in srgb, var(--color-fg) 22%, var(--color-surface))";

function Figure({ rows, sets, picked, onPick, label }: { rows: string[]; sets: (m: string) => number; picked: string | null; onPick: (m: string) => void; label: string }) {
  return (
    <figure className="grid justify-items-center gap-1">
      <svg viewBox={`0 0 16 ${rows.length}`} className="h-auto w-full max-w-[150px] drop-shadow-[0_0_10px_rgb(var(--accent-rgb)/.25)]" shapeRendering="crispEdges" role="img" aria-label={label}>
        {rows.flatMap((line, y) =>
          [...line].flatMap((ch, x) => {
            if (ch === ".") return [];
            if (ch === "y") return [<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="var(--color-accent)" />];
            const muscle = CODE[ch];
            const lv = muscle ? level(sets(muscle)) : null;
            return [
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1.02}
                height={1.02}
                fill={muscle ? FILL[lv!] : BODY}
                className={muscle ? `cursor-pointer ${picked === muscle ? "muscle-picked" : ""}` : undefined}
                onClick={muscle ? () => onPick(muscle) : undefined}
              />,
            ];
          }),
        )}
      </svg>
      <figcaption className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</figcaption>
    </figure>
  );
}

export function MuscleMap({ data }: { data: MuscleVolume[] }) {
  const by = new Map(data.map((m) => [m.muscle, m.hard_sets]));
  const sets = (m: string) => by.get(m) ?? 0;
  const [picked, setPicked] = useState<string | null>(null);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  // Duże partie bez żadnej serii: na nie Bit zwraca uwagę.
  const missing = ["chest", "lats", "upper_back", "side_delts", "quads", "hamstrings", "glutes", "biceps", "triceps"].filter((m) => sets(m) === 0);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-4 px-2">
        <Figure rows={FRONT} sets={sets} picked={picked} onPick={setPicked} label="przód" />
        <Figure rows={BACK} sets={sets} picked={picked} onPick={setPicked} label="tył" />
      </div>
      <div className="min-h-11 rounded-xl bg-surface-2 px-3 py-2 text-center text-[15px]">
        {picked ? (
          <>
            <b>{NAMES[picked]}</b>: <span className="num font-bold" style={{ color: FILL[Math.max(2, level(sets(picked)))] }}>{fmt(sets(picked))}</span>{" "}
            <span className="text-muted">ciężkich serii · cel 10–20</span>
          </>
        ) : missing.length && data.length ? (
          <span className="text-muted">
            Bez serii w tym tygodniu: <b className="text-fg">{missing.map((m) => NAMES[m]).join(", ")}</b>
          </span>
        ) : (
          <span className="text-muted">Dotknij partii, żeby zobaczyć liczbę serii.</span>
        )}
      </div>
      <div className="flex items-center justify-center gap-2.5 font-mono text-[11px] text-muted">
        {LEGEND.map(([lv, text]) => (
          <span key={lv} className="flex items-center gap-1">
            <span className="size-3 rounded-[2px]" style={{ background: FILL[lv] }} />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
