import { useState } from "react";

import { errorText, type Me, type MuscleVolume, type Plan, type PlanDay, type PlanListItem } from "../api";
import { go, href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet, listSessions, startSession } from "../offline/sessions";
import { Button, Card, ErrorText, Loading, Screen, longDate, sets } from "../ui/kit";
import { SessionRow } from "./History";
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, blockText, weekdayOf } from "./plan-format";

export async function startWorkout(day?: PlanDay): Promise<void> {
  const s = await startSession(day);
  go({ name: "workout", id: s.id });
}

async function loadActivePlan(): Promise<Plan | null> {
  const list = await cachedGet<PlanListItem[]>("/programs");
  const active = list.find((p) => p.active);
  return active ? cachedGet<Plan>(`/programs/${active.id}`) : null;
}

/** Trening na dziś z aktywnego planu; w wolny dzień najbliższy następny i wybór innego. */
function PlanToday({ plan, onStart, busy }: { plan: Plan; onStart: (d?: PlanDay) => void; busy: boolean }) {
  const today = weekdayOf(new Date());
  const [picked, setPicked] = useState<number | null>(null);
  const todayIdx = plan.days.findIndex((d) => d.weekdays.includes(today));
  let nextLabel: string | null = null;
  if (todayIdx < 0) {
    for (let k = 1; k <= 7 && !nextLabel; k++) {
      const w = (today + k) % 7;
      const d = plan.days.find((x) => x.weekdays.includes(w));
      if (d) nextLabel = `${k === 1 ? "jutro" : WEEKDAYS_LONG[w]!.toLowerCase()}: ${d.name}`;
    }
  }
  const idx = picked ?? (todayIdx >= 0 ? todayIdx : null);
  const day = idx != null ? plan.days[idx] : undefined;

  return (
    <Card className="grid gap-3 border-accent/70">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold text-accent">&gt; {plan.name}</p>
        <a href={href({ name: "plan", id: plan.id })} className="font-mono text-xs text-muted underline-offset-4 hover:underline">
          edytuj
        </a>
      </div>
      {day ? (
        <>
          <p className="text-xl font-bold">
            {picked == null ? "Dziś: " : ""}
            {day.name}
          </p>
          {day.blocks.length ? (
            <ol className="grid gap-1">
              {day.blocks.map((b, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
                  <span>{b.name}</span>
                  <span className="num shrink-0 text-sm text-muted">{blockText(b)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">Ten dzień nie ma jeszcze bloczków.</p>
          )}
          <Button className="min-h-16 text-lg" onClick={() => onStart(day)} disabled={busy}>
            ▶ Zacznij: {day.name}
          </Button>
        </>
      ) : (
        <p className="text-lg">
          Dziś wolne wg planu.
          {nextLabel && <span className="block text-base text-muted">Następny trening {nextLabel}.</span>}
        </p>
      )}
      {plan.days.length > 1 && (
        <div className="grid gap-1.5">
          <span className="font-mono text-xs text-muted">inny trening z planu:</span>
          <div className="flex flex-wrap gap-1.5">
            {plan.days.map((d, i) => (
              <button
                key={i}
                onClick={() => setPicked(i === todayIdx ? null : i)}
                className={`min-h-10 rounded-full border px-3 font-mono text-sm ${i === idx ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
              >
                {d.name}
                {d.weekdays.length ? ` · ${d.weekdays.map((w) => WEEKDAYS_SHORT[w]).join(" ")}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Orientacyjnie 10–20 ciężkich serii na partię tygodniowo; pasek pełny przy 20.
const WEEKLY_TARGET = 20;

function WeeklyVolume() {
  const { data } = useLoad(() => cachedGet<MuscleVolume[]>("/volume"), []);
  if (!data?.length) return null;
  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Ciężkie serie w tym tygodniu</h2>
      <Card className="grid gap-2.5">
        {data.slice(0, 8).map((m) => (
          <div key={m.muscle} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2">
            <span className="truncate text-sm">{m.name}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${m.hard_sets >= 10 ? "bg-accent" : "bg-accent/50"}`}
                style={{ width: `${Math.min(100, (m.hard_sets / WEEKLY_TARGET) * 100)}%` }}
              />
            </div>
            <span className="num text-right text-sm">{Number.isInteger(m.hard_sets) ? m.hard_sets : m.hard_sets.toFixed(1)}</span>
          </div>
        ))}
        <p className="text-xs text-muted">Partia pomocnicza liczy się za pół serii. Pełny kolor od 10 serii.</p>
      </Card>
    </section>
  );
}

export function Today({ me }: { me: Me }) {
  const { data, error } = useLoad(() => listSessions(6), []);
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cal = useLoad(() => cachedGet<{ week_streak: number }>(`/calendar?start=${iso(monday)}&end=${iso(today)}`), []);
  const plan = useLoad(() => loadActivePlan().catch(() => null), []);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const open = data?.find((s) => !s.ended_at);
  const thisWeek = new Set((data ?? []).filter((s) => s.local_date >= iso(monday)).map((s) => s.local_date)).size;

  async function start(day?: PlanDay) {
    setBusy(true);
    try {
      await startWorkout(day);
    } catch (e) {
      setStartError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen title="Dziś" sub={`${longDate(today.toISOString())} · cześć, ${me.display_name}`}>
      <a href={href({ name: "history" })} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
        <span>
          <span className="num text-lg font-bold">🔥 {cal.data?.week_streak ?? "–"}</span>
          <span className="text-muted"> tyg. z rzędu</span>
        </span>
        <span className="num text-muted">w tym tyg.: {thisWeek}</span>
      </a>

      {open ? (
        <Card className="grid gap-3 border-accent">
          <p className="font-mono text-sm font-semibold text-accent">&gt; trening w toku</p>
          <p className="text-muted">
            Zaczęty {new Date(open.started_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} · {sets(open.set_count)}
          </p>
          <Button onClick={() => go({ name: "workout", id: open.id })}>▶ Wróć do treningu</Button>
        </Card>
      ) : (
        <>
          {plan.data && <PlanToday plan={plan.data} onStart={(d) => void start(d)} busy={busy} />}
          {plan.data === null && (
            <a href={href({ name: "plans" })} className="rounded-2xl border border-dashed border-line px-4 py-3 text-muted">
              Ustaw plan tygodnia (np. poniedziałek: klatka), a tu pojawi się trening na dziś →
            </a>
          )}
          <Button variant={plan.data ? "ghost" : "primary"} className={plan.data ? "" : "min-h-16 text-lg"} onClick={() => void start()} disabled={busy}>
            {plan.data ? "Pusty trening (bez planu)" : "▶ Zacznij trening"}
          </Button>
        </>
      )}
      <ErrorText>{startError ?? error}</ErrorText>

      <WeeklyVolume />

      <section className="grid gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Ostatnie treningi</h2>
        {!data && !error && <Loading />}
        {data?.length === 0 && (
          <Card>
            <p className="text-lg">Jeszcze nic tu nie ma.</p>
            <p className="mt-1 text-muted">Zacznij pierwszy trening, dodaj ćwiczenie i zapisz serię. Rekordy i 1RM policzą się same.</p>
          </Card>
        )}
        {data?.filter((s) => s.ended_at).map((s) => <SessionRow key={s.id} s={s} />)}
      </section>
    </Screen>
  );
}
