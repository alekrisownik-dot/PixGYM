import { useState } from "react";

import { type Exercise, type ExerciseRecord } from "../api";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { IconTrophy } from "../ui/icons";
import { Empty, ErrorText, Loading, Screen, SectionTitle, Segmented, Tile, kg, shortDate } from "../ui/kit";
import { ExerciseArt } from "../ui/exercise-art";

interface Point {
  date: string;
  e1rm_kg: number;
}

const RECORD_ORDER = ["one_rm", "e1rm", "rep_max", "set_volume", "bodyweight_reps"];

function recordName(r: ExerciseRecord): string {
  switch (r.record_type) {
    case "one_rm":
      return "1RM (prawdziwy)";
    case "e1rm":
      return "1RM szacowany";
    case "rep_max":
      return `${r.reps}RM`;
    case "set_volume":
      return "Największa seria";
    case "bodyweight_reps":
      return "Powtórzenia bez obciążenia";
  }
}

const RANGES = [
  ["1m", "1M", 31],
  ["3m", "3M", 92],
  ["1y", "1R", 366],
  ["all", "Wsz.", Infinity],
] as const;
type Range = (typeof RANGES)[number][0];

/** Wykres z wypełnieniem jak na makiecie: linia 1RM, punkt ostatniego wyniku z etykietą. */
function Chart({ points }: { points: Point[] }) {
  const W = 340;
  const H = 170;
  const padL = 30;
  const padR = 14;
  const padT = 18;
  const padB = 22;
  const values = points.map((p) => p.e1rm_kg);
  const span = Math.max(...values) - Math.min(...values);
  const lo = Math.floor(Math.min(...values) - Math.max(2, span * 0.15));
  const hi = Math.ceil(Math.max(...values) + Math.max(2, span * 0.15));
  const t0 = new Date(points[0]!.date).getTime();
  const t1 = new Date(points.at(-1)!.date).getTime();
  const x = (d: string) => padL + (t1 === t0 ? (W - padL - padR) / 2 : ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.e1rm_kg).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.at(-1)!.date).toFixed(1)},${H - padB} L${x(points[0]!.date).toFixed(1)},${H - padB} Z`;
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const last = points.at(-1)!;
  const lx = x(last.date);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Szacowany 1RM: od ${kg(points[0]!.e1rm_kg)} do ${kg(last.e1rm_kg)} kg`}>
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray="3 4" />
          <text x={0} y={y(t) + 4} fontSize="10" fill="var(--color-muted)" fontFamily="var(--font-mono)">
            {Math.round(t)}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#area)" />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.length < 40 && points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.e1rm_kg)} r="2.5" fill="var(--color-accent)" />)}
      <circle cx={lx} cy={y(last.e1rm_kg)} r="5" fill="var(--color-amber)" stroke="var(--color-surface)" strokeWidth="2.5" />
      <text
        x={Math.min(lx, W - padR)}
        y={y(last.e1rm_kg) - 10}
        fontSize="12"
        fontWeight="700"
        fill="var(--color-amber)"
        fontFamily="var(--font-mono)"
        textAnchor={lx > W - 60 ? "end" : "middle"}
      >
        {kg(last.e1rm_kg)}
      </text>
      <text x={padL} y={H - 5} fontSize="10" fill="var(--color-muted)" fontFamily="var(--font-mono)">
        {shortDate(points[0]!.date)}
      </text>
      <text x={W - padR} y={H - 5} fontSize="10" fill="var(--color-muted)" fontFamily="var(--font-mono)" textAnchor="end">
        {shortDate(last.date)}
      </text>
    </svg>
  );
}

export function ExerciseProgress({ id }: { id: string }) {
  const history = useLoad(() => cachedGet<Point[]>(`/exercises/${id}/e1rm`), [id]);
  const records = useLoad(() => cachedGet<ExerciseRecord[]>(`/exercises/${id}/records`), [id]);
  const catalog = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const [range, setRange] = useState<Range>("3m");
  const exercise = catalog.data?.find((e) => e.id === id);
  const name = exercise?.name ?? "Ćwiczenie";
  const sorted = [...(records.data ?? [])].sort(
    (a, b) => RECORD_ORDER.indexOf(a.record_type) - RECORD_ORDER.indexOf(b.record_type) || (a.reps ?? 0) - (b.reps ?? 0),
  );
  const days = RANGES.find((r) => r[0] === range)![2];
  const since = Date.now() - days * 86400_000;
  const all = history.data ?? [];
  const points = all.filter((p) => new Date(p.date).getTime() >= since);
  const shown = points.length ? points : all.slice(-1);
  const change = shown.length > 1 ? shown.at(-1)!.e1rm_kg - shown[0]!.e1rm_kg : null;
  const best = all.reduce((m, p) => Math.max(m, p.e1rm_kg), 0);
  const recent = Date.now() - 7 * 86400_000;
  const bestSet = records.data?.find((r) => r.record_type === "set_volume");

  return (
    <Screen kicker="postęp" title={name} sub={<a href="#/postep" className="text-accent">← wszystkie ćwiczenia</a>}>
      <ErrorText>{history.error ?? records.error}</ErrorText>
      {exercise && (
        <div className="card flex items-center gap-4 p-3">
          <ExerciseArt exercise={exercise} size={132} className="!bg-bg/60" />
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-semibold uppercase tracking-wider text-muted">sprzęt</p>
            <p className="text-[17px] font-semibold">{exercise.equipment}</p>
            {exercise.notes && <p className="mt-1 line-clamp-3 text-[14px] text-muted">{exercise.notes}</p>}
          </div>
        </div>
      )}
      <Segmented value={range} options={RANGES.map(([v, l]) => [v, l] as const)} onChange={setRange} full />
      <div className="card grid gap-1 px-2 pt-3 pb-1">
        <div className="flex items-baseline justify-between px-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">1RM szacowany</span>
          {change != null && (
            <span className={`num text-[13px] font-semibold ${change >= 0 ? "text-accent" : "text-danger"}`}>
              {change >= 0 ? "+" : ""}
              {kg(change)} kg
            </span>
          )}
        </div>
        {!history.data && !history.error && <Loading />}
        {shown.length > 0 ? <Chart points={shown} /> : history.data && <Empty>Brak serii, z których da się policzyć 1RM.</Empty>}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="1RM teraz" value={kg(all.at(-1)?.e1rm_kg)} unit="kg" delta={change != null ? `${change >= 0 ? "+" : ""}${kg(change)} w okresie` : undefined} tone={change != null && change < 0 ? "danger" : "accent"} />
        <Tile label="najlepszy 1RM" value={kg(best || null)} unit="kg" />
        <Tile label="treningi" value={String(all.length)} unit="dni" />
        <Tile label="największa seria" value={bestSet ? kg(bestSet.value, 0) : "–"} unit="kg" />
      </div>

      <section className="grid gap-2">
        <SectionTitle>Rekordy</SectionTitle>
        <div className="card grid px-4 py-1">
          {sorted.length === 0 && records.data && <Empty>Brak rekordów.</Empty>}
          {sorted.map((r) => {
            const fresh = new Date(r.achieved_at).getTime() >= recent;
            return (
              <div key={`${r.record_type}-${r.reps}`} className="flex items-center justify-between gap-3 border-b border-line/70 py-3 last:border-0">
                <div>
                  <p className="font-mono text-[14px] font-semibold">{recordName(r)}</p>
                  <p className="font-mono text-[11px] text-muted">{shortDate(r.achieved_at)}</p>
                </div>
                <span className={`num text-xl font-bold ${fresh ? "text-amber" : ""}`}>
                  {fresh && <IconTrophy size={16} className="mr-1 inline -translate-y-0.5" />}
                  {r.record_type === "bodyweight_reps" ? `${r.value} powt.` : `${kg(r.value)} kg`}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </Screen>
  );
}
