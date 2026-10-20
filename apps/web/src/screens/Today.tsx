import { useState, type ReactNode } from "react";

import { errorText, type CalendarEvent, type Exercise, type Me, type MuscleVolume, type Plan, type PlanDay, type PlanListItem, type PlanProgress } from "../api";
import { go, href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { listEvents } from "../offline/events";
import { cachedGet, listSessions, pendingSessions, startSession } from "../offline/sessions";
import { IconChevronRight, IconDumbbell, IconFlame, IconGrid, IconPlay, IconPlus } from "../ui/icons";
import { Button, Card, Empty, ErrorText, Loading, Screen, SectionTitle, longDate, sets } from "../ui/kit";
import { ExerciseArt } from "../ui/exercise-art";
import { BitSays, type Mood } from "../ui/mascot";
import { Sheet } from "../ui/sheet";
import { quipOfDay } from "../ui/quips";
import { useTheme } from "../ui/theme";
import { SessionRow } from "./History";
import { kindOf } from "./Events";
import { PlanLoop } from "./PlanLoop";
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, blockText, weekdayOf } from "./plan-format";

export async function startWorkout(day?: PlanDay): Promise<void> {
  const s = await startSession(day);
  go({ name: "workout", id: s.id });
}

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayOf(d));

interface ActivePlan {
  plan: Plan;
  /** Tylko dla planu elastycznego: co zaliczone w tym tygodniu. */
  progress: PlanProgress | null;
}

export async function loadActivePlan(): Promise<ActivePlan | null> {
  const list = await cachedGet<PlanListItem[]>("/programs");
  const active = list.find((p) => p.active);
  if (!active) return null;
  const plan = await cachedGet<Plan>(`/programs/${active.id}`);
  if (plan.schedule !== "flexible") return { plan, progress: null };
  const monday = isoDate(mondayOf(new Date()));
  const server = await cachedGet<PlanProgress>(`/programs/${plan.id}/progress?start=${monday}`).catch(() => null);
  // Treningi z tego planu, które czekają na wysłanie (np. zaliczone bez sieci), też się liczą.
  const progress: PlanProgress = { last_day_index: server?.last_day_index ?? null, done: [...(server?.done ?? [])] };
  const local = (await pendingSessions()).sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const s of local) {
    const i = plan.days.findIndex((d) => d.id === s.program_day_id);
    if (i < 0) continue;
    progress.last_day_index = i;
    if (s.local_date >= monday && !progress.done.some((d) => d.session_id === s.id))
      progress.done.push({ day_index: i, local_date: s.local_date, session_id: s.id });
  }
  return { plan, progress };
}

interface PlanState {
  /** Dzień planu podpowiadany na dziś (-1: dziś wolne w planie ze stałymi dniami). */
  todayIdx: number;
  nextLabel: string | null;
  /** Elastyczny: dzień planu → dzień tygodnia (0 = pn), w którym go zaliczono. */
  done: Map<number, number>;
  weekDone: boolean;
}

/** Co dziś: w planie ze stałymi dniami według dnia tygodnia, w elastycznym następny niezaliczony. */
function planToday({ plan, progress }: ActivePlan): PlanState {
  const today = weekdayOf(new Date());
  if (plan.schedule === "flexible") {
    const done = new Map((progress?.done ?? []).map((d) => [d.day_index, weekdayOf(new Date(`${d.local_date}T12:00:00`))]));
    const n = plan.days.length;
    const start = progress?.last_day_index != null ? progress.last_day_index + 1 : 0;
    // Kolejka od dnia po ostatnio zrobionym; pierwszy niezaliczony w tym tygodniu.
    const order = Array.from({ length: n }, (_, k) => (start + k) % n);
    const next = order.find((i) => !done.has(i));
    return { todayIdx: next ?? order[0] ?? -1, nextLabel: null, done, weekDone: n > 0 && next === undefined };
  }
  const todayIdx = plan.days.findIndex((d) => d.weekdays.includes(today));
  let nextLabel: string | null = null;
  if (todayIdx < 0) {
    for (let k = 1; k <= 7 && !nextLabel; k++) {
      const w = (today + k) % 7;
      const d = plan.days.find((x) => x.weekdays.includes(w));
      if (d) nextLabel = `${k === 1 ? "jutro" : WEEKDAYS_LONG[w]!.toLowerCase()}: ${d.name}`;
    }
  }
  return { todayIdx, nextLabel, done: new Map(), weekDone: false };
}

/** Trening na dziś z aktywnego planu; w wolny dzień najbliższy następny i wybór innego. */
function PlanToday({ active, onStart, busy }: { active: ActivePlan; onStart: (d?: PlanDay) => void; busy: boolean }) {
  const { plan } = active;
  const [picked, setPicked] = useState<number | null>(null);
  const { todayIdx, nextLabel } = planToday(active);
  const { data: catalog } = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const byId = new Map((catalog ?? []).map((e) => [e.id, e]));
  const idx = picked ?? (todayIdx >= 0 ? todayIdx : null);
  const day = idx != null ? plan.days[idx] : undefined;

  return (
    <div className="card glow grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
            {picked != null ? "wybrany" : "dziś"} · {plan.name}
          </p>
          <p className="font-mono text-2xl leading-tight font-bold">{day ? day.name : "Dzień wolny"}</p>
          {!day && nextLabel && <p className="text-[15px] text-muted">Następny trening {nextLabel}.</p>}
        </div>
        <a href={href({ name: "plan", id: plan.id })} className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted">
          edytuj
        </a>
      </div>
      {day &&
        (day.blocks.length ? (
          <ol className="grid gap-1.5">
            {day.blocks.map((b, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[15px]">
                <ExerciseArt exercise={byId.get(b.exercise_id) ?? b} size={42} />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <span className="num shrink-0 text-[13px] text-muted">{blockText(b)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">Ten dzień nie ma jeszcze bloczków.</p>
        ))}
      {day && (
        <Button className="min-h-14 text-lg" onClick={() => onStart(day)} disabled={busy}>
          <IconPlay size={18} /> Zacznij trening
        </Button>
      )}
      {plan.days.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {plan.days.map((d, i) => (
            <button
              key={i}
              onClick={() => setPicked(i === todayIdx ? null : i)}
              className={`min-h-9 shrink-0 rounded-full border px-3 font-mono text-[12px] font-semibold ${i === idx ? "border-accent bg-accent/15 text-accent" : "border-line text-muted"}`}
            >
              {d.name}
              {d.weekdays.length ? <span className="opacity-60"> · {d.weekdays.map((w) => WEEKDAYS_SHORT[w]).join(" ")}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Orientacyjnie 10–20 ciężkich serii na partię tygodniowo; pasek pełny przy 20.
const WEEKLY_TARGET = 20;

function VolumeBar({ m }: { m: MuscleVolume }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <span className="flex items-baseline justify-between gap-2 text-[14px]">
        <span className="min-w-0 truncate">{m.name}</span>
        <span className="num shrink-0 text-[13px]">
          <span className="font-semibold">{Number.isInteger(m.hard_sets) ? m.hard_sets : m.hard_sets.toFixed(1)}</span>
          <span className="text-muted">/10</span>
        </span>
      </span>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
        {/* znacznik 10 serii (dolna granica zalecanego zakresu) */}
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <div
          className={`h-full rounded-full ${m.hard_sets >= 10 ? "bg-accent" : "bg-gradient-to-r from-accent/40 to-accent/70"}`}
          style={{ width: `${Math.min(100, (m.hard_sets / WEEKLY_TARGET) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function WeeklyVolume() {
  const { data } = useLoad(() => cachedGet<MuscleVolume[]>("/volume"), []);
  const [all, setAll] = useState(false);
  if (!data?.length) return null;
  const top = data.slice(0, 6);
  return (
    <section className="grid gap-2">
      <SectionTitle
        right={
          data.length > top.length && (
            <button onClick={() => setAll(true)} className="font-mono text-[11px] text-accent">
              wszystkie ({data.length}) →
            </button>
          )
        }
      >
        Ciężkie serie w tym tygodniu
      </SectionTitle>
      <Card className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-4 gap-y-3">
        {top.map((m) => (
          <VolumeBar key={m.muscle} m={m} />
        ))}
      </Card>
      {all && (
        <Sheet title="Ciężkie serie w tym tygodniu" onClose={() => setAll(false)}>
          <div className="grid gap-3.5">
            {data.map((m) => (
              <VolumeBar key={m.muscle} m={m} />
            ))}
            <p className="text-sm text-muted">Orientacyjnie 10–20 serii na partię tygodniowo. Mięsień pomocniczy liczy się za pół serii.</p>
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** Najbliższe wydarzenie z kalendarza (do 2 tygodni naprzód). */
function UpcomingEvent({ e }: { e: CalendarEvent }) {
  const k = kindOf(e.kind);
  const now = new Date();
  const daysLeft = Math.round((new Date(`${e.date}T12:00:00`).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86400_000);
  const when = daysLeft <= 0 ? "dziś" : daysLeft === 1 ? "jutro" : `za ${daysLeft} dni`;
  return (
    <a href={href({ name: "history" })} className="card flex items-center gap-3 px-3.5 py-2.5" style={{ borderLeft: `4px solid ${k.color}` }}>
      <span className="text-2xl" aria-hidden>
        {k.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider" style={{ color: k.color }}>
          {when}
        </span>
        <span className="block truncate text-[16px] font-semibold">{e.title}</span>
      </span>
      <IconChevronRight size={18} className="text-muted" />
    </a>
  );
}

/** Co mówi Bit na ekranie „Dziś”. */
type BitState = { name: string; open: boolean; first: boolean; day: string | null; weekDone: boolean; restDay: boolean; streak: number };

function bitLine(o: BitState): { mood: Mood; text: ReactNode } {
  if (o.open) return { mood: "lift", text: "Trening czeka. Sztanga sama się nie podniesie." };
  if (o.weekDone) return { mood: "flex", text: <>Cały plan na ten tydzień <b className="text-accent">zaliczony</b>! Możesz odpocząć albo dorzucić coś extra.</> };
  if (o.first) return { mood: "idle", text: <>Cześć {o.name}, jestem <b className="text-accent">Bit</b>. Zapisz pierwszą serię, a ja policzę rekordy i 1RM.</> };
  if (o.day) return { mood: "lift", text: <>Dziś <b className="text-accent">{o.day}</b>. Ładuję talerze, wchodzisz?</> };
  if (o.restDay)
    return { mood: "sleep", text: <>Mięśnie się kompilują. Regeneracja to też trening.</> };
  if (o.streak >= 2) return { mood: "flex", text: <>{o.streak} tygodnie z rzędu! Nie przerywaj serii.</> };
  return { mood: "idle", text: <>Hej {o.name}! Co dziś trenujemy?</> };
}

/** Zły Bit (motyw czerwony): te same sytuacje, ton pentestera. */
function evilLine(o: BitState): { mood: Mood; text: ReactNode } {
  if (o.open) return { mood: "lift", text: "Sesja wciąż otwarta. Nie zostawiaj otwartych portów, wracaj na salę." };
  if (o.weekDone) return { mood: "flex", text: <>Wszystkie cele z planu <b className="text-accent">przejęte</b>. Tydzień jest nasz.</> };
  if (o.first) return { mood: "idle", text: <>Witaj, {o.name}. Jestem <b className="text-accent">Bit</b>… ta gorsza wersja. Zapisz serię, a ja złamię każdy Twój rekord.</> };
  if (o.day) return { mood: "lift", text: <>Cel namierzony: <b className="text-accent">{o.day}</b>. Odpalamy exploit.</> };
  if (o.restDay) return { mood: "sleep", text: <>Cisza na łączach. Ładuję payload na jutro.</> };
  if (o.streak >= 2) return { mood: "flex", text: <>{o.streak} tygodnie bez przerwy. Firewall słabości pęka.</> };
  return { mood: "idle", text: <>{o.name}. Którą partię dziś łamiemy?</> };
}

export function Today({ me }: { me: Me }) {
  const evil = useTheme() === "red";
  const [quip, setQuip] = useState(0);
  const { data, error } = useLoad(() => listSessions(6), []);
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cal = useLoad(() => cachedGet<{ week_streak: number }>(`/calendar?start=${iso(monday)}&end=${iso(today)}`), []);
  const plan = useLoad(() => loadActivePlan().catch(() => null), []);
  const in14 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
  const upcoming = useLoad(() => listEvents(iso(today), iso(in14)).catch(() => [] as CalendarEvent[]), []);
  const nextEvent = upcoming.data?.[0];
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

  const planInfo = plan.data ? planToday(plan.data) : null;
  const planDays = plan.data?.plan.days;
  const bit = (evil ? evilLine : bitLine)({
    name: me.display_name,
    open: !!open,
    first: !!data && data.length === 0,
    day: planInfo && planInfo.todayIdx >= 0 ? planDays![planInfo.todayIdx]!.name : null,
    weekDone: !!planInfo?.weekDone,
    restDay: !!planInfo && planInfo.todayIdx < 0,
    streak: cal.data?.week_streak ?? 0,
  });

  return (
    <Screen title="Dziś" sub={<span className="first-letter:uppercase">{longDate(today.toISOString())}</span>}>
      <BitSays
        mood={bit.mood}
        onBitClick={evil ? () => setQuip((q) => q + 1) : undefined}
        footer={
          <>
          {evil && (
            <p key={quip} className="pop mb-1.5 border-l-2 border-accent/60 pl-2 font-mono text-[12.5px] leading-snug text-fg/85">
              {quipOfDay(quip)}
            </p>
          )}
          <a href={href({ name: "history" })} className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[12px] text-muted">
            <span className="inline-flex items-center gap-1">
              <IconFlame size={14} className="text-amber" />
              <b className="num text-fg">{cal.data?.week_streak ?? "–"}</b> tyg. z rzędu
            </span>
            <span className="inline-flex items-center gap-1">
              <IconDumbbell size={14} className="text-accent" />
              <b className="num text-fg">{thisWeek}</b> w tym tyg.
            </span>
          </a>
          </>
        }
      >
        {bit.text}
      </BitSays>

      {nextEvent && <UpcomingEvent e={nextEvent} />}

      {open ? (
        <div className="card glow grid gap-3 p-4">
          <p className="flex items-center gap-2 font-mono text-[13px] font-semibold text-accent">
            <span className="size-2 animate-pulse rounded-full bg-accent" /> trening w toku
          </p>
          <p className="font-mono text-2xl font-bold">{open.exercise_count ? `${open.exercise_count} ćw. · ${sets(open.set_count)}` : "dopiero zaczęty"}</p>
          <p className="-mt-2 text-muted">
            od {new Date(open.started_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <Button className="min-h-15 text-lg" onClick={() => go({ name: "workout", id: open.id })}>
            <IconPlay size={18} /> Wróć do treningu
          </Button>
        </div>
      ) : (
        <>
          {plan.data &&
            (plan.data.plan.schedule === "flexible" ? (
              <PlanLoop plan={plan.data.plan} progress={plan.data.progress} weekKey={isoDate(mondayOf(today))} busy={busy} onStart={(d) => void start(d)} />
            ) : (
              <PlanToday active={plan.data} onStart={(d) => void start(d)} busy={busy} />
            ))}
          {plan.data === null && (
            <a href={href({ name: "plans" })} className="card flex items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                <IconGrid size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Ustaw plan tygodnia</span>
                <span className="block text-sm text-muted">np. poniedziałek: klatka. Tu pojawi się trening na dziś.</span>
              </span>
              <IconChevronRight size={20} className="text-muted" />
            </a>
          )}
          {plan.data ? (
            <button onClick={() => void start()} disabled={busy} className="-mt-1 inline-flex min-h-11 items-center justify-center gap-1.5 font-mono text-[14px] text-muted">
              <IconPlus size={16} /> albo pusty trening, bez planu
            </button>
          ) : (
            <Button className="min-h-15 text-lg" onClick={() => void start()} disabled={busy}>
              <IconPlay size={18} /> Zacznij trening
            </Button>
          )}
        </>
      )}
      <ErrorText>{startError ?? error}</ErrorText>

      <WeeklyVolume />

      <section className="grid gap-2">
        <SectionTitle right={<a href={href({ name: "history" })} className="font-mono text-[11px] text-accent">kalendarz →</a>}>Ostatnie treningi</SectionTitle>
        {!data && !error && <Loading />}
        {data && !data.some((s) => s.ended_at) && <Empty>Jeszcze nic tu nie ma.</Empty>}
        {data
          ?.filter((s) => s.ended_at)
          .slice(0, 3)
          .map((s) => <SessionRow key={s.id} s={s} />)}
      </section>
    </Screen>
  );
}
