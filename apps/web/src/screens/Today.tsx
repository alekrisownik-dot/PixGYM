import { useState } from "react";

import { errorText, type Me, type MuscleVolume } from "../api";
import { go, href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet, listSessions, startSession } from "../offline/sessions";
import { Button, Card, ErrorText, Loading, Screen, longDate, sets } from "../ui/kit";
import { SessionRow } from "./History";

export async function startWorkout(): Promise<void> {
  const s = await startSession();
  go({ name: "workout", id: s.id });
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
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const open = data?.find((s) => !s.ended_at);
  const thisWeek = new Set((data ?? []).filter((s) => s.local_date >= iso(monday)).map((s) => s.local_date)).size;

  async function start() {
    setBusy(true);
    try {
      await startWorkout();
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
        <Button className="min-h-16 text-lg" onClick={() => void start()} disabled={busy}>
          ▶ Zacznij trening
        </Button>
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
