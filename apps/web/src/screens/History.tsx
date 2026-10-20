import { useMemo, useState } from "react";

import type { CalendarData, CalendarEvent, EventKind, SessionListItem } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { listEvents } from "../offline/events";
import { cachedGet, listSessions } from "../offline/sessions";
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus } from "../ui/icons";
import { Card, Empty, ErrorText, Loading, Screen, SectionTitle, Tile, longDate, plural, tonnage, sets } from "../ui/kit";
import { EventRow, EventSheet, kindOf } from "./Events";
import { weekdayOf } from "./plan-format";
import { loadActivePlan, startWorkout } from "./Today";

const DOW = new Intl.DateTimeFormat("pl-PL", { weekday: "short" });
const MON = new Intl.DateTimeFormat("pl-PL", { month: "short" });

export function SessionRow({ s }: { s: SessionListItem }) {
  const d = new Date(`${s.local_date}T12:00:00`);
  return (
    <a href={href({ name: s.ended_at ? "summary" : "workout", id: s.id })} className="card flex items-center gap-3.5 px-3.5 py-3 active:bg-surface-2">
      <span className="grid w-12 shrink-0 justify-items-center rounded-xl border border-line bg-surface-2/70 py-1.5 leading-none">
        <span className="font-mono text-[10px] uppercase text-muted">{DOW.format(d).replace(".", "")}</span>
        <span className="num text-xl font-bold">{d.getDate()}</span>
        <span className="font-mono text-[10px] text-muted">{MON.format(d).replace(".", "")}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {!s.ended_at ? "w toku" : s.set_count === 0 ? "dzień zaliczony" : plural(s.exercise_count, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
        </span>
        <span className="num block text-[13px] text-muted">{s.ended_at && s.set_count === 0 ? "bez zapisu serii" : sets(s.set_count)}</span>
      </span>
      {s.ended_at && s.set_count === 0 ? <IconCheck size={22} className="text-accent" strokeWidth={3} /> : <span className="num text-lg font-bold">{tonnage(s.tonnage_kg)}</span>}
      <IconChevronRight size={18} className="text-muted" />
    </a>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTH = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });
const WEEKDAYS = ["pn", "wt", "śr", "cz", "pt", "sb", "nd"];

/** Poziom 1–4 jak w „commit graph”: progi z kwartyli tonażu dni treningowych. */
export function levels(tonnageByDay: Map<string, number>): (day: string) => number {
  const vals = [...tonnageByDay.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (day) => {
    if (!tonnageByDay.has(day)) return 0;
    const v = tonnageByDay.get(day)!;
    // Od góry: przy kilku podobnych dniach wszystkie są „mocne”, nie najsłabsze.
    return v >= q3 ? 4 : v >= q2 ? 3 : v >= q1 ? 2 : 1;
  };
}

const LEVEL_BG = ["", "rgb(var(--accent-rgb) / .22)", "rgb(var(--accent-rgb) / .45)", "rgb(var(--accent-rgb) / .72)", "var(--color-accent)"];
const WEEKS = 20;

/** Ostatnie 20 tygodni jako kratki (jak wykres commitów na GitHubie): im ciemniej, tym więcej kg. */
function CommitGraph({ tonnage, onPick }: { tonnage: Map<string, number>; onPick: (day: string) => void }) {
  const level = levels(tonnage);
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const first = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (WEEKS - 1));
  const todayIso = iso(today);
  const cols = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => iso(new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + d))),
  );
  const count = cols.flat().filter((d) => tonnage.has(d)).length;
  return (
    <div className="card grid gap-2 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[12px] font-semibold text-accent">$ git log --graph</span>
        <span className="num text-[12px] text-muted">
          {count} dni w {WEEKS} tyg.
        </span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {cols.flat().map((day) => {
          const l = level(day);
          const future = day > todayIso;
          return (
            <button
              key={day}
              onClick={() => !future && onPick(day)}
              disabled={future}
              className={`aspect-square rounded-[3px] ${l ? "" : "bg-surface-2"} ${future ? "opacity-0" : ""} ${day === todayIso ? "ring-1 ring-fg/70" : ""}`}
              style={l ? { background: LEVEL_BG[l] } : undefined}
              aria-label={`${day}${l ? `, trening (${Math.round(tonnage.get(day)!)} kg)` : ""}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-1 font-mono text-[11px] text-muted">
        mniej
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`size-2.5 rounded-[2px] ${l ? "" : "bg-surface-2"}`} style={l ? { background: LEVEL_BG[l] } : undefined} />
        ))}
        więcej
      </div>
    </div>
  );
}

function MonthCalendar({
  month,
  trained,
  level,
  events,
  planned,
  selected,
  onSelect,
}: {
  month: Date;
  trained: Map<string, number>;
  /** Poziom intensywności dnia (1–4) do odcienia kratki. */
  level: (day: string) => number;
  events: Map<string, CalendarEvent[]>;
  /** Trening z planu (stałe dni tygodnia) na dni od dziś wzwyż. */
  planned: Map<string, string>;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = iso(new Date());
  const cells: (string | null)[] = [...Array<null>(offset).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(month.getFullYear(), month.getMonth(), d)));

  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {WEEKDAYS.map((w) => (
        <span key={w} className="pb-1 font-mono text-xs text-muted">
          {w}
        </span>
      ))}
      {cells.map((day, i) => {
        if (!day) return <span key={i} />;
        const count = trained.get(day) ?? 0;
        const evs = events.get(day) ?? [];
        const plan = !count ? planned.get(day) : undefined;
        const isSel = selected === day;
        return (
          <button
            key={day}
            onClick={() => onSelect(isSel ? null : day)}
            className={`num relative aspect-square rounded-xl text-[15px] font-semibold transition ${
              count ? (level(day) >= 3 ? "text-accent-ink" : "text-fg") : "text-muted/80"
            } ${day === today && !count ? "border border-fg/60 text-fg" : plan ? "border border-dashed border-accent/60 text-fg" : ""} ${isSel ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : ""}`}
            style={count ? { background: LEVEL_BG[Math.max(1, level(day))] } : undefined}
            aria-label={`${day}${count ? `, treningów: ${count}` : ""}${evs.length ? `, wydarzenia: ${evs.map((e) => e.title).join(", ")}` : ""}`}
          >
            {Number(day.slice(8))}
            {evs.length > 0 && (
              <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                {evs.slice(0, 3).map((e) => (
                  <span key={e.id} className="size-1.5 rounded-full ring-1 ring-bg" style={{ background: kindOf(e.kind).color }} />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function History() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const start = iso(month);
  const end = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const cal = useLoad(() => cachedGet<CalendarData>(`/calendar?start=${start}&end=${end}`), [start]);
  const list = useLoad(() => listSessions(200), []);
  const ev = useLoad(() => listEvents(start, end), [start]);
  const [editing, setEditing] = useState<{ event?: CalendarEvent; date: string; kind?: EventKind } | null>(null);
  const events = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of ev.data ?? []) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [ev.data]);
  const shownEvents = (ev.data ?? []).filter((e) => (selected ? e.date === selected : true));
  const active = useLoad(() => loadActivePlan().catch(() => null), []);
  const planDays = active.data?.plan.days ?? [];
  // Stałe dni planu rozpisane na przyszłe dni miesiąca (plan elastyczny nie ma stałych dni).
  const planned = useMemo(() => {
    const m = new Map<string, string>();
    if (!active.data || active.data.plan.schedule === "flexible") return m;
    const todayIso = iso(new Date());
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const date = new Date(month.getFullYear(), month.getMonth(), d);
      const key = iso(date);
      const day = key >= todayIso ? planDays.find((p) => p.weekdays.includes(weekdayOf(date))) : undefined;
      if (day) m.set(key, day.name);
    }
    return m;
  }, [active.data, month]);
  const isFuture = !!selected && selected >= iso(new Date());

  // Dni z treningami: z serwera i z treningów, które jeszcze czekają na wysłanie.
  const trained = useMemo(() => {
    const m = new Map((cal.data?.days ?? []).map((d) => [d.date, d.sessions]));
    for (const s of list.data ?? []) if (s.local_date >= start && s.local_date <= end && !m.has(s.local_date)) m.set(s.local_date, 1);
    return m;
  }, [cal.data, list.data, start, end]);

  // Tonaż na dzień (wszystkie wczytane treningi): odcienie kratek i commit graph.
  const tonnage = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of list.data ?? []) if (s.ended_at) m.set(s.local_date, (m.get(s.local_date) ?? 0) + s.tonnage_kg);
    return m;
  }, [list.data]);
  const level = useMemo(() => levels(tonnage), [tonnage]);

  const shown = (list.data ?? []).filter((s) => (selected ? s.local_date === selected : s.local_date >= start && s.local_date <= end));
  const shift = (by: number) => {
    setSelected(null);
    setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  };
  // Do przodu można planować do roku.
  const now = new Date();
  const atLimit = (month.getFullYear() - now.getFullYear()) * 12 + month.getMonth() - now.getMonth() >= 12;

  return (
    <Screen
      kicker="historia"
      title="Treningi"
      action={
        <button className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-4 font-mono font-bold text-accent-ink" onClick={() => void startWorkout()}>
          <IconPlus size={18} /> Nowy
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Tile label="seria" value={String(cal.data?.week_streak ?? "–")} unit="tyg." />
        <Tile label="ten miesiąc" value={String(trained.size)} unit="dni" />
        <Tile label="łącznie" value={String(cal.data?.total_days ?? "–")} unit="dni" />
      </div>
      <CommitGraph
        tonnage={tonnage}
        onPick={(day) => {
          setMonth(new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 1));
          setSelected(day);
        }}
      />
      <Card className="grid gap-3">
        <div className="flex items-center justify-between">
          <button onClick={() => shift(-1)} className="grid size-11 place-items-center rounded-xl border border-line" aria-label="Poprzedni miesiąc">
            <IconChevronLeft size={20} />
          </button>
          <span className="font-mono text-[17px] font-semibold first-letter:uppercase">{MONTH.format(month)}</span>
          <button onClick={() => shift(1)} disabled={atLimit} className="grid size-11 place-items-center rounded-xl border border-line disabled:opacity-30" aria-label="Następny miesiąc">
            <IconChevronRight size={20} />
          </button>
        </div>
        <MonthCalendar month={month} trained={trained} level={level} events={events} planned={planned} selected={selected} onSelect={setSelected} />
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs text-muted">{selected ? <span className="first-letter:uppercase">{longDate(selected)}</span> : "dotknij dnia, żeby zobaczyć"}</p>
          <button
            onClick={() => setEditing({ date: selected ?? iso(new Date()), kind: isFuture ? "workout" : "event" })}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-accent/70 px-3 font-mono text-[13px] font-semibold text-accent"
          >
            <IconPlus size={16} /> wydarzenie
          </button>
        </div>
      </Card>

      {selected && planned.get(selected) && !trained.get(selected) && (
        <div className="card flex items-center gap-3 border-dashed !border-accent/60 px-3.5 py-3">
          <span className="text-2xl" aria-hidden>
            🗓️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">w planie</span>
            <span className="block truncate text-[17px] font-semibold">{planned.get(selected)}</span>
          </span>
        </div>
      )}
      {isFuture && (
        <button
          onClick={() => setEditing({ date: selected!, kind: "workout" })}
          className="card flex min-h-13 items-center justify-center gap-2 border-dashed font-mono font-semibold text-accent"
        >
          <IconPlus size={18} /> Zaplanuj trening na ten dzień
        </button>
      )}

      {shownEvents.length > 0 && (
        <section className="grid gap-2">
          <SectionTitle>{selected ? "Wydarzenia tego dnia" : "Wydarzenia w tym miesiącu"}</SectionTitle>
          {shownEvents.map((e) => (
            <EventRow key={e.id} e={e} showDate={!selected} onClick={() => setEditing({ event: e, date: e.date })} />
          ))}
        </section>
      )}
      {(selected ? shown.length > 0 : shownEvents.length > 0) && <SectionTitle>Treningi</SectionTitle>}

      <ErrorText>{list.error ?? cal.error}</ErrorText>
      {!list.data && !list.error && <Loading />}
      {list.data && shown.length === 0 && !(selected && events.has(selected)) && !isFuture && start <= iso(new Date()) && <Empty>{selected ? "Brak treningu tego dnia." : "Brak treningów w tym miesiącu."}</Empty>}
      {editing && <EventSheet initial={editing.event} date={editing.date} kind={editing.kind} planDays={planDays.map((d) => d.name)} onClose={() => setEditing(null)} onSaved={() => void ev.reload()} />}
      <div className="grid gap-2">{shown.map((s) => <SessionRow key={s.id} s={s} />)}</div>
    </Screen>
  );
}
