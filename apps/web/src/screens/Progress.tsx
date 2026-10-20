import { useState } from "react";

import { type Exercise, type Rank, type SessionListItem, type TrainedExercise } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet, listSessions } from "../offline/sessions";
import { IconArrowDown, IconArrowUp, IconChevronRight } from "../ui/icons";
import { ErrorText, Loading, ProgressBar, Screen, SectionTitle, Segmented, Tile, kg, plural, shortDate, tonnage } from "../ui/kit";
import { BitSays } from "../ui/mascot";
import { muscleGroup } from "../ui/muscles";
import { Body } from "./Body";
import { ExerciseArt } from "../ui/exercise-art";

const TIERS = 8;

export function RankCard({ r }: { r: Rank }) {
  return (
    <div className="card grid gap-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{r.name}</span>
        {r.ratio != null && <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{r.ratio}× masy ciała</span>}
      </div>
      {r.title ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="font-mono text-[22px] leading-none font-bold text-accent">{r.title}</p>
            {/* Paski rang: ile z 8 zdobyte. */}
            <div className="flex gap-0.5" aria-label={`ranga ${(r.tier ?? 0) + 1} z ${TIERS}`}>
              {Array.from({ length: TIERS }, (_, i) => (
                <span key={i} className={`h-4 w-1.5 rounded-sm ${i <= (r.tier ?? 0) ? "bg-accent" : "bg-surface-2"}`} />
              ))}
            </div>
          </div>
          {r.next_title ? (
            <>
              <ProgressBar value={r.progress ?? 0} />
              <p className="text-[13px] text-muted">
                do <span className="font-mono text-fg">{r.next_title}</span>: 1RM {kg(r.next_at_kg)} kg
              </p>
            </>
          ) : (
            <p className="text-[13px] text-muted">najwyższa ranga 🏁</p>
          )}
        </>
      ) : (
        <p className="text-[14px] text-muted">Brak rangi. Potrzebny wynik i masa ciała (wpisz ją w treningu).</p>
      )}
    </div>
  );
}

const PERIODS = [
  ["4w", "4 tyg.", 28],
  ["3m", "3 mies.", 91],
  ["all", "Wszystko", Infinity],
] as const;
type Period = (typeof PERIODS)[number][0];

const DAY_MS = 86400_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Do czego porównać tonaż, żeby liczba coś mówiła (masy orientacyjne). */
function compare(kgTotal: number): string | null {
  const things: [number, string, string, string][] = [
    [5000, "słoń", "słonie", "słoni"],
    [1400, "samochód", "samochody", "samochodów"],
    [250, "pianino", "pianina", "pianin"],
    [80, "człowiek", "ludzi", "ludzi"],
  ];
  for (const [mass, one, few, many] of things) {
    const n = Math.round(kgTotal / mass);
    if (n >= 1) return n === 1 ? `1 ${one}` : plural(n, one, few, many);
  }
  return null;
}

/** Słupki: tonaż kolejnych treningów i przerywana linia średniej. */
function TonnageChart({ items, average }: { items: SessionListItem[]; average: number }) {
  const W = 340;
  const H = 150;
  const padT = 22;
  const padB = 20;
  const max = Math.max(...items.map((s) => s.tonnage_kg), average) * 1.08 || 1;
  const gap = items.length > 14 ? 3 : 6;
  const bw = (W - gap * (items.length - 1)) / items.length;
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const best = items.reduce((m, s) => Math.max(m, s.tonnage_kg), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Tonaż ostatnich ${items.length} treningów, średnio ${tonnage(average)}`}>
      {items.map((s, i) => {
        const x = i * (bw + gap);
        const top = y(s.tonnage_kg);
        const above = s.tonnage_kg >= average;
        return (
          <g key={s.id}>
            <rect x={x} y={top} width={bw} height={Math.max(2, H - padB - top)} rx={Math.min(5, bw / 3)} fill="var(--color-accent)" opacity={above ? 0.95 : 0.4} />
            {s.tonnage_kg === best && items.length <= 14 && top < y(average) - 14 && (
              <text x={x + bw / 2} y={top - 6} fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--color-fg)" fontFamily="var(--font-mono)">
                {tonnage(s.tonnage_kg)}
              </text>
            )}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={y(average)} y2={y(average)} stroke="var(--color-amber)" strokeWidth="2" strokeDasharray="6 4" />
      <text x={0} y={H - 4} fontSize="10" fill="var(--color-muted)" fontFamily="var(--font-mono)">
        {shortDate(items[0]!.local_date)}
      </text>
      <text x={W} y={H - 4} fontSize="10" fill="var(--color-muted)" fontFamily="var(--font-mono)" textAnchor="end">
        {shortDate(items.at(-1)!.local_date)}
      </text>
    </svg>
  );
}

function Stats() {
  const { data, error } = useLoad(() => listSessions(200), []);
  const [period, setPeriod] = useState<Period>("4w");
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Loading />;

  const days = PERIODS.find((p) => p[0] === period)![2];
  const now = Date.now();
  const done = data.filter((s) => s.ended_at && s.set_count > 0);
  const inRange = (s: SessionListItem, from: number, to: number) => {
    const t = new Date(`${s.local_date}T12:00:00`).getTime();
    return t > from && t <= to;
  };
  const cur = done.filter((s) => inRange(s, now - days * DAY_MS, now)).sort((a, b) => a.local_date.localeCompare(b.local_date));
  const prev = Number.isFinite(days) ? done.filter((s) => inRange(s, now - 2 * days * DAY_MS, now - days * DAY_MS)) : [];

  if (!cur.length)
    return (
      <BitSays mood="sleep">
        {done.length ? "W tym okresie nie było treningów. Wybierz dłuższy zakres albo idź poćwiczyć." : "Po pierwszym treningu policzę tu średnie i pokażę wykres."}
      </BitSays>
    );

  const avgT = avg(cur.map((s) => s.tonnage_kg))!;
  const prevAvg = avg(prev.map((s) => s.tonnage_kg));
  const diff = prevAvg ? (avgT - prevAvg) / prevAvg : null;
  const total = cur.reduce((t, s) => t + s.tonnage_kg, 0);
  const avgSets = avg(cur.map((s) => s.set_count))!;
  const durations = cur.map((s) => (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 1000).filter((d) => d > 60 && d < 6 * 3600);
  const avgMin = avg(durations);
  const weeks = Number.isFinite(days) ? days / 7 : Math.max(1, (now - new Date(`${cur[0]!.local_date}T12:00:00`).getTime()) / (7 * DAY_MS));
  const like = compare(total);

  return (
    <>
      <Segmented value={period} options={PERIODS.map(([v, l]) => [v, l] as const)} onChange={setPeriod} full />

      <div className="card glow grid gap-2 p-4">
        <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-muted">średnio na trening</span>
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-[44px] leading-none font-bold text-accent">{tonnage(avgT)}</span>
          {diff != null && (
            <span className={`num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[14px] font-bold ${diff >= 0 ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"}`}>
              {diff >= 0 ? <IconArrowUp size={15} /> : <IconArrowDown size={15} />}
              {Math.abs(Math.round(diff * 100))}%
            </span>
          )}
        </div>
        <p className="text-[15px] text-muted">
          podniesionych kilogramów{diff != null ? <> · <span className="whitespace-nowrap">{diff >= 0 ? "więcej" : "mniej"} niż okres wcześniej</span></> : ""}
        </p>
        {cur.length > 1 && (
          <>
            <TonnageChart items={cur.slice(-20)} average={avgT} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-accent" /> powyżej średniej
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-accent/40" /> poniżej
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-amber" /> średnia
              </span>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="treningi" value={String(cur.length)} unit={`· ${(cur.length / weeks).toFixed(1).replace(".", ",")}/tydz.`} />
        <Tile label="łącznie" value={tonnage(total)} />
        <Tile label="serii na trening" value={avgSets.toFixed(1).replace(".0", "").replace(".", ",")} />
        <Tile label="czas treningu" value={avgMin != null ? String(Math.round(avgMin / 60)) : "–"} unit="min" />
      </div>

      {like && (
        <BitSays mood="flex" size={60}>
          Łącznie <b className="text-accent">{tonnage(total)}</b>. To jakbyś podniósł {like}!
        </BitSays>
      )}
    </>
  );
}

const TABS = [
  ["stats", "Średnie"],
  ["ranks", "Rangi"],
  ["exercises", "Ćwiczenia"],
  ["body", "Sylwetka"],
] as const;
type Tab = (typeof TABS)[number][0];

export function Progress() {
  const [tab, setTab] = useState<Tab>("stats");
  const exercises = useLoad(() => cachedGet<TrainedExercise[]>("/progress/exercises"), []);
  const ranks = useLoad(() => cachedGet<Rank[]>("/ranks"), []);
  const catalog = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const byId = new Map((catalog.data ?? []).map((e) => [e.id, e]));

  return (
    <Screen kicker="postęp" title="Postęp">
      <Segmented value={tab} options={TABS} onChange={setTab} full />

      {tab === "stats" && <Stats />}
      {tab === "body" && <Body />}

      {tab === "ranks" && (
        <>
          <ErrorText>{ranks.error}</ErrorText>
          {!ranks.data && !ranks.error && <Loading />}
          <div className="grid gap-2.5">
            {ranks.data
              ?.filter((r) => r.title)
              .map((r) => <RankCard key={r.lift} r={r} />)}
          </div>
          {!!ranks.data?.some((r) => !r.title) && (
            <section className="grid gap-2">
              <SectionTitle>Jeszcze bez rangi</SectionTitle>
              <div className="card grid px-4 py-1">
                {ranks.data
                  .filter((r) => !r.title)
                  .map((r) => (
                    <div key={r.lift} className="flex items-center justify-between gap-3 border-b border-line/70 py-3 last:border-0">
                      <span className="text-[16px] font-semibold">{r.name}</span>
                      <span className="font-mono text-[12px] text-muted">brak rangi</span>
                    </div>
                  ))}
              </div>
            </section>
          )}
          <p className="px-1 text-[15px] text-muted">Ranga zależy od 1RM względem masy ciała. Masę wpiszesz w treningu (przycisk ⋯ u góry).</p>
        </>
      )}

      {tab === "exercises" && (
        <>
          <ErrorText>{exercises.error}</ErrorText>
          {!exercises.data && !exercises.error && <Loading />}
          {exercises.data?.length === 0 && <BitSays>Po pierwszym treningu pojawią się tu wykresy i rekordy każdego ćwiczenia.</BitSays>}
          {!!exercises.data?.length && (
            <div className="grid gap-2">
              {exercises.data.map((e) => (
                <a
                  key={e.id}
                  href={href({ name: "exercise", id: e.id })}
                  className="card flex items-center gap-3 py-3 pr-3 pl-3 active:bg-surface-2"
                  style={muscleGroup(byId.get(e.id)?.muscle) ? { borderLeft: `4px solid ${muscleGroup(byId.get(e.id)?.muscle)!.color}` } : undefined}
                >
                  <ExerciseArt exercise={byId.get(e.id) ?? e} size={60} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] leading-snug font-semibold">{e.name}</span>
                    <span className="block text-[14px] text-muted">
                      {plural(e.sessions, "trening", "treningi", "treningów")} · ostatnio {shortDate(e.last_date)}
                    </span>
                  </span>
                  {e.e1rm_kg != null && (
                    <span className="text-right leading-tight">
                      <span className="num block text-[22px] font-bold">{kg(e.e1rm_kg)}</span>
                      <span className="block font-mono text-[11px] text-muted">1RM kg</span>
                    </span>
                  )}
                  <IconChevronRight size={18} className="text-muted" />
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
