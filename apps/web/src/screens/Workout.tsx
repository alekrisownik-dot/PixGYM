import { useEffect, useMemo, useState } from "react";

import { errorText, type Exercise, type LastPerformance, type SavedSet, type Session, type SessionExercise, type SetType, type Settings, type WorkoutSet } from "../api";
import { platesFor } from "../domain";
import { go, href } from "../app/router";
import { useLoad } from "../app/useLoad";
import * as local from "../offline/sessions";
import { cachedGet } from "../offline/sessions";
import { SET_SYNCED } from "../offline/sync";
import { Button, ErrorText, Loading, Screen, Segmented, clock, kg } from "../ui/kit";
import { IconCheck, IconChevronRight, IconMore, IconNote, IconPlus, IconTimer, IconTrash } from "../ui/icons";
import { Bit } from "../ui/mascot";
import { Sheet } from "../ui/sheet";
import { getTheme } from "../ui/theme";
import { toast } from "../ui/toast";
import { ExerciseArt, sceneFor } from "../ui/exercise-art";
import { ExerciseInfo } from "./ExerciseInfo";
import { ExercisePicker } from "./ExercisePicker";
import { blockText, schemeText } from "./plan-format";
import { RestBar, restFor, setRestFor, useRestTimer } from "./rest";
import { suggest, type Rule } from "./suggest";
import { loadActivePlan } from "./Today";

const DEFAULT_PLATES = { "25": 4, "20": 2, "15": 2, "10": 2, "5": 2, "2.5": 2, "1.25": 2 };

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible")
        navigator.wakeLock
          .request("screen")
          .then((l) => (lock = l))
          .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [active]);
}

const working = (e: SessionExercise) => e.sets.filter((x) => x.set_type !== "warmup").length;
const plannedOf = (e: SessionExercise) => (e.target ? e.target.set_scheme?.length || e.target.target_sets : 0);

export function Workout({ id }: { id: string }) {
  const { data: session, error, setData: setSession } = useLoad(() => local.loadSession(id), [id]);
  const catalogLoad = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const { data: recent } = useLoad(() => cachedGet<{ id: string }[]>("/progress/exercises"), []);
  const { data: settings } = useLoad(() => cachedGet<Settings>("/me/settings"), []);
  const { data: active } = useLoad(() => loadActivePlan().catch(() => null), []);
  const { data: rules } = useLoad(() => cachedGet<Rule[]>("/progression-rules").catch(() => [] as Rule[]), []);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rest = useRestTimer();
  const running = !!session && !session.ended_at;
  const now = useNow(running);
  useWakeLock(running);

  const catalog = catalogLoad.data;
  const byId = useMemo(() => new Map((catalog ?? []).map((e) => [e.id, e])), [catalog]);

  // Serwer przeliczył serię (po synchronizacji): podmieniamy 1RM na ekranie.
  useEffect(() => {
    const on = (ev: Event) => {
      const saved = (ev as CustomEvent<SavedSet>).detail;
      setSession((s) =>
        s && {
          ...s,
          exercises: s.exercises.map((e) => ({
            ...e,
            sets: e.sets.map((x) => (x.id === saved.id ? { ...x, effective_kg: saved.effective_kg, e1rm_kg: saved.e1rm_kg } : x)),
          })),
        },
      );
    };
    window.addEventListener(SET_SYNCED, on);
    return () => window.removeEventListener(SET_SYNCED, on);
  }, [setSession]);

  useEffect(() => {
    if (!session || openId !== null || !session.exercises.length) return;
    // Otwieramy pierwsze ćwiczenie, któremu brakuje serii do celu z planu; bez planu ostatnie.
    const todo = session.exercises.find((e) => e.target && working(e) < plannedOf(e));
    setOpenId((todo ?? session.exercises.at(-1)!).id);
  }, [session, openId]);

  if (error) return <Screen title="Trening"><ErrorText>{error}</ErrorText></Screen>;
  if (!session) return <Loading />;

  async function act(fn: () => Promise<void>) {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  /** Po ostatniej serii z planu przechodzimy do następnego niedokończonego ćwiczenia. */
  function advanceFrom(seId: string, next: Session) {
    const i = next.exercises.findIndex((e) => e.id === seId);
    const todo = [...next.exercises.slice(i + 1), ...next.exercises.slice(0, i)].find((e) => e.target && working(e) < plannedOf(e));
    if (!todo) return;
    setOpenId(todo.id);
    setTimeout(() => document.getElementById(`ex-${todo.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const addExercise = (e: Exercise) =>
    act(async () => {
      setPicking(false);
      const { session: next, id: seId } = await local.addExercise(session, e);
      setSession(next);
      setOpenId(seId);
    });

  const doneSets = session.exercises.reduce((n, e) => n + working(e), 0);
  const plannedSets = session.exercises.reduce((n, e) => n + Math.max(plannedOf(e), working(e)), 0);

  const finish = () =>
    act(async () => {
      const left = plannedSets - doneSets;
      if (left > 0 && !confirm(`Z planu zostało ${left} serii. Zakończyć mimo to?`)) return;
      await local.patchSession(session, { ended_at: new Date().toISOString() });
      rest.stop();
      go({ name: "summary", id: session.id });
    });

  const remove = () =>
    act(async () => {
      if (!confirm("Usunąć cały trening? Rekordy z niego też znikną.")) return;
      await local.deleteSession(session);
      go({ name: "today" }, true);
    });

  const elapsed = (now - new Date(session.started_at).getTime()) / 1000;
  const needsBodyweight = session.exercises.some((e) => e.tracking === "bodyweight_reps") && !session.bodyweight_kg;
  const defaultRest = settings?.default_rest_s ?? 120;
  const progress = plannedSets ? doneSets / plannedSets : 0;

  return (
    <main className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)] gap-3 px-3 pb-44">
      {/* Pasek u góry zostaje na miejscu: czas, postęp i „Zakończ” zawsze pod ręką. */}
      <header className="sticky z-20 -mx-3 border-b border-line/70 bg-bg/90 px-4 pt-3 pb-2.5 backdrop-blur-lg" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-semibold text-accent">&gt; {running ? "trening w toku" : "zakończony"}</p>
            <h1 className="truncate font-mono text-[22px] leading-tight font-bold">{session.day_name ?? "Trening"}</h1>
          </div>
          <button onClick={() => setMenu(true)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-muted" aria-label="Opcje treningu">
            <IconMore size={20} />
          </button>
          {running ? (
            <Button onClick={finish} className="!min-h-11 shrink-0 !px-3.5 !text-[15px]" disabled={!session.exercises.length}>
              <IconCheck size={18} /> Zakończ
            </Button>
          ) : (
            <a href={href({ name: "summary", id: session.id })} className="grid min-h-11 shrink-0 place-items-center rounded-xl border border-line px-3 font-mono text-sm">
              podsumowanie
            </a>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 font-mono text-[13px]">
          {running && <span className="num font-semibold text-fg">{clock(elapsed)}</span>}
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="num text-muted">
            <span className="text-fg">{doneSets}</span>/{plannedSets || doneSets} serii
          </span>
        </div>
      </header>

      {needsBodyweight && (
        <button onClick={() => setMenu(true)} className="flex items-center justify-between gap-2 rounded-xl border border-amber/70 bg-amber/10 px-3.5 py-2.5 text-left text-[15px] text-amber">
          Podaj masę ciała (do ćwiczeń z masą ciała)
          <IconChevronRight size={18} />
        </button>
      )}

      {session.exercises.length === 0 && (
        <div className="grid justify-items-center gap-2 py-6 text-center">
          <Bit mood="lift" size={84} />
          <p className="text-lg font-semibold">Pusty trening</p>
          <p className="text-muted">Dodaj pierwsze ćwiczenie. Ja zajmę się liczeniem.</p>
        </div>
      )}

      {session.exercises.map((se) => (
        <ExerciseCard
          key={se.id}
          se={se}
          session={session}
          exercise={byId.get(se.exercise_id)}
          barKg={settings?.bar_weight_kg ?? 20}
          plates={settings?.plate_inventory ?? DEFAULT_PLATES}
          restS={se.target?.rest_s ?? restFor(se.exercise_id, defaultRest)}
          rule={rules?.find((r) => r.id === se.target?.progression_rule_id)}
          open={openId === se.id}
          onToggle={() => setOpenId(openId === se.id ? "" : se.id)}
          onSession={setSession}
          onCatalogChange={() => void catalogLoad.reload()}
          onSetSaved={(s, restS, next) => {
            if (running && s.set_type !== "warmup") rest.start(restS);
            const e = next.exercises.find((x) => x.id === se.id)!;
            if (plannedOf(e) && working(e) === plannedOf(e)) advanceFrom(se.id, next);
          }}
        />
      ))}

      <ErrorText>{actionError}</ErrorText>

      <button
        className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-dashed border-line font-mono font-semibold text-muted transition active:bg-surface disabled:opacity-50"
        onClick={() => setPicking(true)}
        disabled={!catalog}
      >
        <IconPlus size={20} /> Dodaj ćwiczenie
      </button>

      <RestBar timer={rest} />

      {menu && (
        <Sheet title="Trening" onClose={() => setMenu(false)}>
          <div className="grid gap-3">
            <BodyweightRow session={session} highlight={needsBodyweight} onSaved={setSession} />
            {active && active.plan.days.length > 0 && (
              <div className="grid gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Zalicz jako dzień planu · {active.plan.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {active.plan.days.map((d) => {
                    const on = session.program_day_id === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => void act(async () => setSession(await local.assignDay(session, on ? null : d)))}
                        className={`min-h-10 rounded-full border px-3.5 font-mono text-[14px] font-semibold ${on ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
                      >
                        {on && "✓ "}
                        {d.name}
                      </button>
                    );
                  })}
                </div>
                <span className="text-sm text-muted">Trening zrobiony „bez planu” też może zaliczyć dzień. Dotknij zaznaczonego, żeby odpiąć.</span>
              </div>
            )}
            <Button variant="danger" onClick={() => void remove()}>
              <IconTrash size={18} /> Usuń cały trening
            </Button>
          </div>
        </Sheet>
      )}

      {picking && catalog && (
        <ExercisePicker
          exercises={catalog}
          recent={(recent ?? []).map((r) => r.id)}
          onPick={addExercise}
          onClose={() => setPicking(false)}
          onCreated={(e) => {
            void catalogLoad.reload();
            void addExercise(e);
          }}
        />
      )}
    </main>
  );
}

function BodyweightRow({ session, highlight, onSaved }: { session: Session; highlight: boolean; onSaved: (s: Session) => void }) {
  const [value, setValue] = useState(session.bodyweight_kg?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const kgValue = value.trim() ? Number(value.replace(",", ".")) : null;
    if (kgValue === session.bodyweight_kg) return;
    if (kgValue !== null && !(kgValue >= 20 && kgValue <= 400)) return setError("Podaj masę 20–400 kg.");
    setError(null);
    onSaved(await local.patchSession(session, { bodyweight_kg: kgValue }));
  }
  return (
    <div className={`card flex items-center justify-between gap-3 px-4 py-2.5 ${highlight ? "!border-amber/80" : ""}`}>
      <label htmlFor="bw" className="text-muted">
        Masa ciała {highlight && <span className="block text-sm text-amber">potrzebna przy ćwiczeniach z masą ciała</span>}
        {!highlight && <span className="block text-sm">do DOTS w rankingu</span>}
        {error && <span className="block text-sm text-danger">{error}</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="bw"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          placeholder="–"
          className="num min-h-11 w-20 rounded-lg border border-line bg-bg px-2 text-right text-lg outline-none focus:border-accent"
        />
        <span className="text-muted">kg</span>
      </div>
    </div>
  );
}

// --- ćwiczenie: tabela serii wpisywanych w wierszu ---

/** Wiersz w trakcie wpisywania: a = ciężar / czas / dystans, b = powtórzenia. */
interface RowDraft {
  a?: string;
  b?: string;
  rpe?: number | null;
  set_type?: SetType;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const isRepsTracking = (t: SessionExercise["tracking"]) => t === "weight_reps" || t === "bodyweight_reps";

/** Ciężar zapisany łącznie; przy ćwiczeniu „na stronę” pokazujemy połowę. */
const shown = (w: number | null, perSide: boolean) => (w != null && perSide ? w / 2 : w);

function valueA(s: Pick<WorkoutSet, "weight_kg" | "added_kg" | "duration_s" | "distance_m">, tracking: SessionExercise["tracking"], perSide = false): string {
  const v = { weight_reps: shown(s.weight_kg, perSide), bodyweight_reps: s.added_kg, duration: s.duration_s, distance: s.distance_m }[tracking];
  return v != null ? kg(v, 2) : "";
}

function setLabel(s: WorkoutSet, tracking: SessionExercise["tracking"], perSide = false): string {
  if (tracking === "duration") return `${s.duration_s ?? "–"}s`;
  if (tracking === "distance") return `${s.distance_m ?? "–"}m`;
  if (tracking === "bodyweight_reps") return `${s.added_kg ? `${s.added_kg > 0 ? "+" : ""}${kg(s.added_kg)}×` : "MC×"}${s.reps ?? "–"}`;
  return `${perSide ? "2×" : ""}${kg(shown(s.weight_kg, perSide))}×${s.reps ?? "–"}`;
}

const RECORD_NAMES: Record<string, string> = {
  e1rm: "1RM szac.",
  one_rm: "1RM",
  rep_max: "RM",
  set_volume: "największa seria",
  bodyweight_reps: "powtórzenia",
};

const SET_TYPES: ReadonlyArray<readonly [SetType, string, string]> = [
  ["working", "robocza", ""],
  ["warmup", "rozgrzewka", "R"],
  ["drop", "drop-set", "D"],
  ["failure", "do upadku", "U"],
  ["amrap", "AMRAP", "A"],
];
const SET_MARK = Object.fromEntries(SET_TYPES.map(([t, , m]) => [t, m]));
const RPES = [null, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const REST_OPTIONS = [60, 90, 120, 150, 180, 240, 300];

type SheetState = { kind: "exercise" } | { kind: "set"; key: string } | null;

function ExerciseCard({
  se,
  session,
  exercise,
  barKg,
  plates: inventory,
  restS,
  rule,
  open,
  onToggle,
  onSession,
  onSetSaved,
  onCatalogChange,
}: {
  se: SessionExercise;
  session: Session;
  exercise: Exercise | undefined;
  barKg: number;
  plates: Record<string, number>;
  restS: number;
  rule?: Rule;
  open: boolean;
  onToggle: () => void;
  onSession: (s: Session) => void;
  onSetSaved: (s: WorkoutSet, restS: number, next: Session) => void;
  onCatalogChange: () => void;
}) {
  const { data: last } = useLoad(
    () => cachedGet<LastPerformance | null>(`/exercises/${se.exercise_id}/last?before_session=${session.id}`).catch(() => null),
    [se.exercise_id, session.id],
  );
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [extra, setExtra] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rest, setRest] = useState(restS);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [justDone, setJustDone] = useState<string | null>(null);

  // Rekord ogłaszamy, gdy serwer potwierdzi serię (od razu online, po synchronizacji offline).
  useEffect(() => {
    const on = (ev: Event) => {
      const saved = (ev as CustomEvent<SavedSet>).detail;
      if (saved.session_exercise_id !== se.id) return;
      const beaten = saved.records.filter((r) => r.beat_previous);
      if (!beaten.length) return;
      const best = beaten.find((r) => r.record_type === "e1rm") ?? beaten[0]!;
      const name = best.record_type === "rep_max" ? `${best.reps}RM` : RECORD_NAMES[best.record_type];
      toast({ tone: "record", title: getTheme() === "red" ? "Nowy rekord! Natty? Nikt nie uwierzy." : "Nowy rekord!", body: `${se.name} · ${name} ${best.record_type === "bodyweight_reps" ? best.value : `${kg(best.value)} kg`}` });
      navigator.vibrate?.(80);
    };
    window.addEventListener(SET_SYNCED, on);
    return () => window.removeEventListener(SET_SYNCED, on);
  }, [se.id, se.name]);

  const isReps = isRepsTracking(se.tracking);
  // Ciężar wpisywany na stronę / rękę: na ekranie połowa, w zapisie całość.
  const perSide = !!exercise?.per_side && se.tracking === "weight_reps";
  const total = (a: number | null) => (a != null && perSide ? Math.round(a * 2 * 100) / 100 : a);
  const prevSets = last?.sets ?? [];
  const lastWorking = prevSets.filter((s) => s.set_type !== "warmup").at(-1);
  const planned = plannedOf(se);
  const done = working(se);
  // Tyle wierszy, ile w planie albo ile było ostatnio; zawsze przynajmniej jeden do wpisania na start.
  const base = Math.max(planned, prevSets.length, 1);
  const pendingCount = Math.max(0, base - se.sets.length) + extra;
  const pendingKeys = Array.from({ length: pendingCount }, (_, i) => `new-${se.sets.length + i}`);
  const lastSaved = [...se.sets].reverse().find((s) => s.set_type !== "warmup") ?? se.sets.at(-1);
  const isLower = ["squat", "deadlift", "legmachine", "lunge", "hipthrust"].includes(sceneFor(exercise ?? { name: se.name }));
  const sugg = se.tracking === "weight_reps" ? suggest(se.target, last, rule, isLower) : null;

  /** Podpowiedź (szary tekst) dla wiersza na pozycji idx. */
  function hint(idx: number): { a: string; b: string } {
    const prev = prevSets[idx];
    const from = lastSaved ?? prev ?? lastWorking;
    const pos = idx - (se.sets.length - done);
    // Podpowiedź z progresji ma pierwszeństwo, dopóki nie zapiszesz serii z innym ciężarem.
    const s = sugg?.sets[Math.min(pos, sugg.sets.length - 1)];
    if (s && (!lastSaved || lastSaved.weight_kg === s.weight_kg)) {
      return { a: s.weight_kg != null ? kg(perSide ? s.weight_kg / 2 : s.weight_kg, 2) : "", b: String(s.reps) };
    }
    const scheme = se.target?.set_scheme?.[pos];
    const reps = scheme?.reps ?? se.target?.rep_max ?? se.target?.rep_min ?? prev?.reps ?? from?.reps;
    return { a: from ? valueA(from, se.tracking, perSide) : "", b: reps != null ? String(reps) : "" };
  }

  const patchDraft = (key: string, patch: RowDraft) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  async function complete(key: string, idx: number) {
    setError(null);
    const d = drafts[key] ?? {};
    const h = hint(idx);
    const a = num(d.a ?? h.a);
    const b = num(d.b ?? h.b);
    if (isReps && (b == null || !Number.isInteger(b) || b < 0 || b > 100)) return setError("Podaj liczbę powtórzeń 0–100.");
    if (a != null && (Number.isNaN(a) || a > 1000)) return setError("Zły ciężar.");
    if (!isReps && a == null) return setError(se.tracking === "duration" ? "Podaj czas w sekundach." : "Podaj dystans w metrach.");
    try {
      const { session: next, set } = await local.saveSet(session, se.id, {
        set_index: (se.sets.at(-1)?.set_index ?? -1) + 1,
        set_type: d.set_type ?? "working",
        weight_kg: se.tracking === "weight_reps" ? total(a) : null,
        added_kg: se.tracking === "bodyweight_reps" ? a : null,
        reps: isReps ? b : null,
        duration_s: se.tracking === "duration" ? a : null,
        distance_m: se.tracking === "distance" ? a : null,
        rpe: d.rpe ?? null,
        completed_at: new Date().toISOString(),
      });
      // Wiersze przed odhaczonym przesuwają się o jedną pozycję (klucz = pozycja w ćwiczeniu).
      setDrafts((old) => {
        const out: Record<string, RowDraft> = {};
        for (const [k, v] of Object.entries(old)) {
          const n = Number(k.slice(4));
          if (!k.startsWith("new-") || n === idx) continue;
          out[`new-${n < idx ? n + 1 : n}`] = v;
        }
        return out;
      });
      // Wiersz dodany przyciskiem „+ Seria” po odhaczeniu znika z puli dodatkowych.
      if (base <= se.sets.length) setExtra((x) => Math.max(0, x - 1));
      setJustDone(set.id);
      onSession(next);
      onSetSaved(set, rest, next);
    } catch (e) {
      setError(errorText(e));
    }
  }

  /** Poprawka odhaczonej serii: zapis po wyjściu z pola. */
  async function commitEdit(s: WorkoutSet, patch: RowDraft = {}) {
    const d = { ...drafts[s.id], ...patch };
    if (d.a === undefined && d.b === undefined && d.rpe === undefined && d.set_type === undefined) return;
    setError(null);
    const a = d.a !== undefined ? num(d.a) : null;
    const b = d.b !== undefined ? num(d.b) : s.reps;
    if (isReps && (b == null || !Number.isInteger(b) || b < 0 || b > 100)) return setError("Podaj liczbę powtórzeń 0–100.");
    try {
      const pick = <T,>(field: SessionExercise["tracking"], v: T) => (d.a !== undefined && se.tracking === field ? ((field === "weight_reps" ? total(a) : a) as T) : v);
      const { session: next } = await local.saveSet(
        session,
        se.id,
        {
          set_index: s.set_index,
          set_type: d.set_type ?? s.set_type,
          weight_kg: pick("weight_reps", s.weight_kg),
          added_kg: pick("bodyweight_reps", s.added_kg),
          reps: isReps ? b : null,
          duration_s: pick("duration", s.duration_s),
          distance_m: pick("distance", s.distance_m),
          rpe: d.rpe !== undefined ? d.rpe : s.rpe,
          completed_at: s.completed_at ?? new Date().toISOString(),
        },
        s.id,
      );
      setDrafts(({ [s.id]: _, ...rest }) => rest);
      onSession(next);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function removeSet(id: string) {
    setSheet(null);
    onSession(await local.deleteSet(session, id));
  }

  async function removeExercise() {
    if (!confirm(`Usunąć ${se.name} z treningu?`)) return;
    setSheet(null);
    onSession(await local.removeExercise(session, se.id));
  }

  function pickRest(v: number) {
    setRest(v);
    setRestFor(se.exercise_id, v);
  }

  // Talerze dla pierwszej serii do zrobienia.
  const firstKey = pendingKeys[0];
  const firstA = firstKey ? total(num(drafts[firstKey]?.a ?? hint(se.sets.length).a)) : null;
  const plates =
    exercise?.equipment === "Sztanga" && se.tracking === "weight_reps" && firstA && firstA > barKg ? platesFor(firstA, barKg, inventory) : null;

  const colA = { weight_reps: perSide ? "KG/STR." : "KG", bodyweight_reps: "+KG", duration: "SEK.", distance: "METRY" }[se.tracking];
  const rowGrid = isReps ? "grid-cols-[2rem_minmax(0,1fr)_4.25rem_4.25rem_2.75rem]" : "grid-cols-[2rem_minmax(0,1fr)_8.75rem_2.75rem]";
  const allDone = planned > 0 && done >= planned;
  let workingNo = 0;
  const inputCls = "num h-11 w-full min-w-0 rounded-lg border text-center text-[19px] font-semibold outline-none transition focus:border-accent placeholder:font-normal placeholder:text-muted/45";

  const sheetSet = sheet?.kind === "set" ? se.sets.find((s) => s.id === sheet.key) : undefined;
  const sheetDraft = sheet?.kind === "set" ? (drafts[sheet.key] ?? {}) : {};

  return (
    <section id={`ex-${se.id}`} className={`card scroll-mt-28 grid grid-cols-[minmax(0,1fr)] gap-2.5 p-3 transition ${open ? "glow" : ""}`}>
      <div className="flex items-start gap-2">
        <button onClick={onToggle} className="shrink-0" aria-hidden tabIndex={-1}>
          <ExerciseArt exercise={exercise ?? { name: se.name, tracking: se.tracking }} size={58} />
        </button>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <p className="text-[18px] leading-snug font-bold">{se.name}</p>
          <p className="mt-0.5 truncate font-mono text-[12.5px]">
            {se.target && <span className="font-semibold text-accent">{blockText(se.target)}</span>}
            {se.target && lastWorking && <span className="text-muted"> · </span>}
            {lastWorking && <span className="text-cyan">ost. {setLabel(lastWorking, se.tracking, perSide)}</span>}
            {!se.target && !lastWorking && <span className="text-muted">pierwszy raz · powodzenia</span>}
          </p>
          {sugg && sugg.change !== 0 && open && (
            <p className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[12px] font-semibold ${sugg.change > 0 ? "bg-amber/15 text-amber" : "bg-cyan/15 text-cyan"}`}>
              {sugg.change > 0 ? "↑" : "↓"} dziś {kg(perSide ? sugg.sets[0]!.weight_kg! / 2 : sugg.sets[0]!.weight_kg!)} kg{perSide ? "/str." : ""}
            </p>
          )}
          {sugg && sugg.change !== 0 && open && <p className="mt-0.5 text-[13px] leading-snug text-muted">{sugg.reason}</p>}
        </button>
        <span className={`num mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold ${allDone ? "bg-accent text-accent-ink" : "bg-surface-2 text-fg"}`}>
          {planned ? `${done}/${planned}` : done}
        </span>
        <button onClick={() => setSheet({ kind: "exercise" })} className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-lg text-muted active:bg-surface-2" aria-label={`Opcje: ${se.name}`}>
          <IconMore size={20} />
        </button>
      </div>

      {!open && se.sets.length > 0 && (
        <button onClick={onToggle} className="-mt-1 flex flex-wrap gap-1.5 px-1 text-left">
          {se.sets.map((s) => (
            <span key={s.id} className={`num rounded-md px-1.5 py-0.5 text-[13px] ${s.set_type === "warmup" ? "bg-surface-2/60 text-muted" : "bg-accent/12 text-fg"}`}>
              {setLabel(s, se.tracking, perSide)}
            </span>
          ))}
        </button>
      )}

      {open && (
        <>
          {exercise?.notes && (
            <p className="flex items-start gap-1.5 px-1 text-sm text-muted">
              <IconNote size={15} className="mt-0.5 shrink-0" /> {exercise.notes}
            </p>
          )}
          {se.target?.set_scheme?.length ? <p className="px-1 font-mono text-[12px] text-muted">{schemeText(se.target)}</p> : null}

          <div className="grid gap-1">
            <div className={`grid ${rowGrid} items-center gap-1.5 px-1 font-mono text-[10.5px] font-semibold tracking-wider text-muted`}>
              <span className="text-center">#</span>
              <span>POPRZ.</span>
              <span className="text-center">{colA}</span>
              {isReps && <span className="text-center">POWT.</span>}
              <span className="grid place-items-center">
                <IconCheck size={14} />
              </span>
            </div>

            {se.sets.map((s, i) => {
              if (s.set_type !== "warmup") workingNo++;
              const d = drafts[s.id] ?? {};
              const prev = prevSets[i];
              return (
                <div key={s.id} className={`grid ${rowGrid} items-center gap-1.5 rounded-xl bg-accent/10 px-1 py-1`}>
                  <SetNo s={s} n={workingNo} onClick={() => setSheet({ kind: "set", key: s.id })} />
                  <span className="num truncate text-[13px] text-muted">{prev ? setLabel(prev, se.tracking, perSide) : "–"}</span>
                  <input
                    inputMode="decimal"
                    aria-label={`${colA} seria ${i + 1}`}
                    value={d.a ?? valueA(s, se.tracking, perSide)}
                    placeholder={se.tracking === "bodyweight_reps" ? "MC" : "–"}
                    onChange={(e) => patchDraft(s.id, { a: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => void commitEdit(s)}
                    className={`${inputCls} border-transparent bg-transparent`}
                  />
                  {isReps && (
                    <input
                      inputMode="numeric"
                      aria-label={`powtórzenia seria ${i + 1}`}
                      value={d.b ?? (s.reps != null ? String(s.reps) : "")}
                      onChange={(e) => patchDraft(s.id, { b: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => void commitEdit(s)}
                      className={`${inputCls} border-transparent bg-transparent`}
                    />
                  )}
                  <button
                    onClick={() => setSheet({ kind: "set", key: s.id })}
                    className={`grid size-11 place-items-center rounded-lg bg-accent text-accent-ink ${justDone === s.id ? "check-pop" : ""}`}
                    aria-label={`Seria ${i + 1} zrobiona, opcje`}
                  >
                    <IconCheck size={22} strokeWidth={3} />
                  </button>
                </div>
              );
            })}

            {pendingKeys.map((key, i) => {
              const idx = se.sets.length + i;
              const d = drafts[key] ?? {};
              const h = hint(idx);
              const prev = prevSets[idx];
              const type = d.set_type ?? "working";
              return (
                <div key={key} className={`grid ${rowGrid} items-center gap-1.5 rounded-xl px-1 py-1`}>
                  <button
                    onClick={() => setSheet({ kind: "set", key })}
                    className={`grid h-11 place-items-center rounded-lg font-mono text-[14px] font-bold ${SET_MARK[type] ? "text-amber" : "text-muted"} active:bg-surface-2`}
                    aria-label={`Typ i RPE serii ${idx + 1}`}
                  >
                    {type === "warmup" ? "R" : `${done + i + 1}${SET_MARK[type] ?? ""}`}
                    {d.rpe != null && <span className="-mt-1.5 text-[9.5px] text-cyan">@{d.rpe}</span>}
                  </button>
                  <button
                    onClick={() => prev && patchDraft(key, { a: valueA(prev, se.tracking, perSide), b: prev.reps != null ? String(prev.reps) : undefined })}
                    className="num truncate text-left text-[13px] text-muted"
                    aria-label="Wpisz jak poprzednio"
                  >
                    {prev ? setLabel(prev, se.tracking, perSide) : "–"}
                  </button>
                  <input
                    inputMode="decimal"
                    enterKeyHint="next"
                    aria-label={`${colA} seria ${idx + 1}`}
                    value={d.a ?? ""}
                    placeholder={h.a || (se.tracking === "bodyweight_reps" ? "MC" : "–")}
                    onChange={(e) => patchDraft(key, { a: e.target.value })}
                    className={`${inputCls} border-line bg-bg`}
                  />
                  {isReps && (
                    <input
                      inputMode="numeric"
                      enterKeyHint="done"
                      aria-label={`powtórzenia seria ${idx + 1}`}
                      value={d.b ?? ""}
                      placeholder={h.b || "–"}
                      onChange={(e) => patchDraft(key, { b: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && void complete(key, idx)}
                      className={`${inputCls} border-line bg-bg`}
                    />
                  )}
                  <button
                    onClick={() => void complete(key, idx)}
                    className="grid size-11 place-items-center rounded-lg border border-line bg-surface-2 text-muted transition active:scale-95 active:bg-accent active:text-accent-ink"
                    aria-label={`Odhacz serię ${idx + 1}`}
                  >
                    <IconCheck size={22} strokeWidth={2.5} />
                  </button>
                </div>
              );
            })}
          </div>

          {plates && (
            <div className="flex flex-wrap items-center gap-1.5 px-1 font-mono text-xs text-muted">
              <span>talerze na stronę:</span>
              {plates.per_side.length ? (
                plates.per_side.map((p, i) => (
                  <span key={i} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-semibold text-fg">
                    {kg(p, 2)}
                  </span>
                ))
              ) : (
                <span>sam gryf</span>
              )}
              {!plates.exact && <span>(najbliżej {kg(plates.total_kg)} kg)</span>}
            </div>
          )}

          <ErrorText>{error}</ErrorText>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button onClick={() => setExtra(extra + 1)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-2/70 font-mono text-[14px] font-semibold">
              <IconPlus size={18} /> Seria
            </button>
            <button onClick={() => setSheet({ kind: "exercise" })} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface-2/70 px-3.5 font-mono text-[14px] text-muted" aria-label="Przerwa po serii tego ćwiczenia">
              <IconTimer size={17} /> {clock(rest)}
            </button>
          </div>
        </>
      )}

      {sheet?.kind === "exercise" && (
        <Sheet title={se.name} onClose={() => setSheet(null)}>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Przerwa po serii</span>
              <Segmented value={String(rest)} options={REST_OPTIONS.map((r) => [String(r), clock(r)] as const)} onChange={(v) => pickRest(Number(v))} />
            </div>
            {exercise && (
              <div className="grid gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Maszyna i notatka</span>
                <ExerciseInfo exercise={exercise} onChange={onCatalogChange} />
              </div>
            )}
            <a href={href({ name: "exercise", id: se.exercise_id })} className="card flex min-h-12 items-center justify-between px-4 font-semibold">
              Postęp w tym ćwiczeniu <IconChevronRight size={18} className="text-muted" />
            </a>
            <Button variant="danger" onClick={() => void removeExercise()}>
              <IconTrash size={18} /> Usuń z treningu
            </Button>
          </div>
        </Sheet>
      )}

      {sheet?.kind === "set" && (
        <Sheet title={sheetSet ? `Seria · ${setLabel(sheetSet, se.tracking, perSide)}` : "Następna seria"} onClose={() => setSheet(null)}>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Typ serii</span>
              <div className="flex flex-wrap gap-1.5">
                {SET_TYPES.map(([t, label]) => {
                  const on = (sheetDraft.set_type ?? sheetSet?.set_type ?? "working") === t;
                  return (
                    <button
                      key={t}
                      onClick={() => (sheetSet ? void commitEdit(sheetSet, { set_type: t }) : patchDraft(sheet.key, { set_type: t }))}
                      className={`min-h-11 rounded-full border px-4 font-mono text-[14px] font-semibold ${on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="text-sm text-muted">Rozgrzewka nie liczy się do rekordów ani objętości.</span>
            </div>
            <div className="grid gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">RPE · jak ciężko (10 = nic więcej)</span>
              <div className="grid grid-cols-5 gap-1.5">
                {RPES.map((v) => {
                  const cur = sheetDraft.rpe !== undefined ? sheetDraft.rpe : (sheetSet?.rpe ?? null);
                  return (
                    <button
                      key={String(v)}
                      onClick={() => (sheetSet ? void commitEdit(sheetSet, { rpe: v }) : patchDraft(sheet.key, { rpe: v }))}
                      className={`num min-h-12 rounded-lg border text-[16px] font-semibold ${cur === v ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2/60"}`}
                    >
                      {v ?? "–"}
                    </button>
                  );
                })}
              </div>
            </div>
            {sheetSet ? (
              <Button variant="danger" onClick={() => void removeSet(sheetSet.id)}>
                <IconTrash size={18} /> Usuń serię
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setSheet(null)}>
                Gotowe
              </Button>
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function SetNo({ s, n, onClick }: { s: WorkoutSet; n: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`grid h-11 place-items-center rounded-lg font-mono text-[14px] font-bold leading-none ${SET_MARK[s.set_type] ? "text-amber" : "text-fg"}`} aria-label="Typ i RPE serii">
      <span>{s.set_type === "warmup" ? "R" : `${n}${SET_MARK[s.set_type] ?? ""}`}</span>
      {s.rpe != null && <span className="text-[9.5px] text-cyan">@{s.rpe}</span>}
    </button>
  );
}
