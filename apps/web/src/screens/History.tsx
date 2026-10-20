import { useMemo, useState } from "react";

import type { CalendarData, SessionListItem } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet, listSessions } from "../offline/sessions";
import { Card, Empty, ErrorText, Loading, Screen, longDate, tonnage, days, sets } from "../ui/kit";
import { startWorkout } from "./Today";

export function SessionRow({ s }: { s: SessionListItem }) {
  return (
    <a href={href({ name: s.ended_at ? "summary" : "workout", id: s.id })} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 active:bg-surface-2">
      <div className="min-w-0">
        <p className="font-semibold first-letter:uppercase">{longDate(s.local_date)}</p>
        <p className="num text-sm text-muted">
          {s.exercise_count} ćw. · {sets(s.set_count)}{!s.ended_at && " · w toku"}
        </p>
      </div>
      <span className="num text-lg font-bold">{tonnage(s.tonnage_kg)}</span>
    </a>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTH = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });
const WEEKDAYS = ["pn", "wt", "śr", "cz", "pt", "sb", "nd"];

function MonthCalendar({
  month,
  trained,
  selected,
  onSelect,
}: {
  month: Date;
  trained: Map<string, number>;
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
        const isSel = selected === day;
        return (
          <button
            key={day}
            onClick={() => onSelect(isSel ? null : day)}
            disabled={!count}
            className={`num aspect-square rounded-lg text-base font-semibold ${
              count ? "bg-accent text-accent-ink" : "text-muted"
            } ${day === today ? "outline outline-2 outline-offset-[-2px] outline-fg" : ""} ${isSel ? "ring-2 ring-amber" : ""}`}
            aria-label={`${day}${count ? `, treningów: ${count}` : ""}`}
          >
            {Number(day.slice(8))}
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

  // Dni z treningami: z serwera i z treningów, które jeszcze czekają na wysłanie.
  const trained = useMemo(() => {
    const m = new Map((cal.data?.days ?? []).map((d) => [d.date, d.sessions]));
    for (const s of list.data ?? []) if (s.local_date >= start && s.local_date <= end && !m.has(s.local_date)) m.set(s.local_date, 1);
    return m;
  }, [cal.data, list.data, start, end]);

  const shown = (list.data ?? []).filter((s) => (selected ? s.local_date === selected : s.local_date >= start && s.local_date <= end));
  const shift = (by: number) => {
    setSelected(null);
    setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  };
  const isCurrent = month.getMonth() === new Date().getMonth() && month.getFullYear() === new Date().getFullYear();

  return (
    <Screen
      title="Treningi"
      sub={cal.data ? `🔥 ${cal.data.week_streak} tyg. z rzędu · dni treningowe: ${cal.data.total_days}` : "kalendarz"}
      action={
        <button className="min-h-11 whitespace-nowrap rounded-xl bg-accent px-4 font-mono font-bold text-accent-ink" onClick={() => void startWorkout()}>
          + Nowy
        </button>
      }
    >
      <Card className="grid gap-3">
        <div className="flex items-center justify-between">
          <button onClick={() => shift(-1)} className="min-h-11 min-w-11 rounded-lg border border-line font-mono" aria-label="Poprzedni miesiąc">
            ‹
          </button>
          <span className="font-mono font-semibold first-letter:uppercase">{MONTH.format(month)}</span>
          <button onClick={() => shift(1)} disabled={isCurrent} className="min-h-11 min-w-11 rounded-lg border border-line font-mono disabled:opacity-30" aria-label="Następny miesiąc">
            ›
          </button>
        </div>
        <MonthCalendar month={month} trained={trained} selected={selected} onSelect={setSelected} />
        <p className="num text-center text-sm text-muted">w tym miesiącu: {days(trained.size)}</p>
      </Card>

      <ErrorText>{list.error ?? cal.error}</ErrorText>
      {!list.data && !list.error && <Loading />}
      {list.data && shown.length === 0 && <Empty>{selected ? "Brak treningu tego dnia." : "Brak treningów w tym miesiącu."}</Empty>}
      <div className="grid gap-2">{shown.map((s) => <SessionRow key={s.id} s={s} />)}</div>
    </Screen>
  );
}
