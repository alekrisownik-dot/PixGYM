import { useEffect, useMemo, useState } from "react";

import { errorText, type Exercise, type LastPerformance, type SavedSet, type Session, type SessionExercise, type SetType, type Settings, type WorkoutSet } from "../api";
import { platesFor } from "../domain";
import { go } from "../app/router";
import { useLoad } from "../app/useLoad";
import * as local from "../offline/sessions";
import { cachedGet } from "../offline/sessions";
import { SET_SYNCED } from "../offline/sync";
import { Button, Card, ErrorText, Loading, Screen, clock, kg, longDate, sets } from "../ui/kit";
import { ExerciseInfo } from "./ExerciseInfo";
import { ExercisePicker } from "./ExercisePicker";
import { blockText, schemeText } from "./plan-format";
import { RestBar, restFor, setRestFor, useRestTimer } from "./rest";

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

export function Workout({ id }: { id: string }) {
  const { data: session, error, setData: setSession } = useLoad(() => local.loadSession(id), [id]);
  const catalogLoad = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const { data: recent } = useLoad(() => cachedGet<{ id: string }[]>("/progress/exercises"), []);
  const { data: settings } = useLoad(() => cachedGet<Settings>("/me/settings"), []);
  const [picking, setPicking] = useState(false);
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
    if (session && openId === null && session.exercises.length) setOpenId(session.exercises.at(-1)!.id);
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

  const addExercise = (e: Exercise) =>
    act(async () => {
      setPicking(false);
      const { session: next, id: seId } = await local.addExercise(session, e);
      setSession(next);
      setOpenId(seId);
    });

  const finish = () =>
    act(async () => {
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

  return (
    <Screen
      title={running ? "Trening" : "Trening zakończony"}
      sub={
        running ? (
          <span className="num">
            {session.day_name ? `${session.day_name} · ` : ""}
            {clock(elapsed)} · {session.exercises.length} ćw.
          </span>
        ) : (
          <span className="first-letter:uppercase">{longDate(session.local_date)}</span>
        )
      }
      action={
        !running && (
          <a href={`#/podsumowanie/${session.id}`} className="grid min-h-11 place-items-center rounded-xl border border-line px-3 font-mono text-sm">
            podsumowanie
          </a>
        )
      }
    >
      <BodyweightRow session={session} highlight={needsBodyweight} onSaved={setSession} />

      {session.exercises.map((se) => (
        <ExerciseCard
          key={se.id}
          se={se}
          session={session}
          exercise={byId.get(se.exercise_id)}
          barKg={settings?.bar_weight_kg ?? 20}
          plates={settings?.plate_inventory ?? DEFAULT_PLATES}
          restS={se.target?.rest_s ?? restFor(se.exercise_id, defaultRest)}
          open={openId === se.id}
          onOpen={() => setOpenId(openId === se.id ? "" : se.id)}
          onSession={setSession}
          onCatalogChange={() => void catalogLoad.reload()}
          onSetSaved={(s, restS) => {
            if (running && s.set_type !== "warmup") rest.start(restS);
          }}
        />
      ))}

      <ErrorText>{actionError}</ErrorText>

      <Button variant="ghost" className="min-h-14 border-dashed" onClick={() => setPicking(true)} disabled={!catalog}>
        + Dodaj ćwiczenie
      </Button>

      {running && session.exercises.length > 0 && <Button onClick={finish}>✓ Zakończ trening</Button>}
      <button onClick={remove} className="min-h-12 font-mono text-sm text-danger">
        Usuń trening
      </button>

      <RestBar timer={rest} />

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
    </Screen>
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
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 ${highlight ? "border-amber" : "border-line"}`}>
      <label htmlFor="bw" className="text-muted">
        Masa ciała {highlight && <span className="block text-sm text-amber">potrzebna przy ćwiczeniach z masą ciała</span>}
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

// --- ćwiczenie i zapis serii ---

interface Draft {
  editing: string | null;
  set_type: SetType;
  weight: string;
  reps: string;
  rpe: number | null;
  duration: string;
  distance: string;
}

function draftFrom(s: WorkoutSet | undefined, tracking: SessionExercise["tracking"]): Draft {
  const weight = tracking === "bodyweight_reps" ? s?.added_kg : s?.weight_kg;
  return {
    editing: null,
    set_type: s?.set_type ?? "working",
    weight: weight != null ? String(weight) : "",
    reps: s?.reps != null ? String(s.reps) : tracking === "bodyweight_reps" ? "" : "8",
    rpe: null,
    duration: s?.duration_s != null ? String(s.duration_s) : "",
    distance: s?.distance_m != null ? String(s.distance_m) : "",
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function setLabel(s: WorkoutSet, tracking: SessionExercise["tracking"]): string {
  if (tracking === "duration") return `${s.duration_s ?? "–"} s`;
  if (tracking === "distance") return `${s.distance_m ?? "–"} m`;
  if (tracking === "bodyweight_reps") return `${s.added_kg ? `${s.added_kg > 0 ? "+" : ""}${kg(s.added_kg)} kg × ` : "× "}${s.reps ?? "–"}`;
  return `${kg(s.weight_kg)} × ${s.reps ?? "–"}`;
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

const REST_OPTIONS = [60, 90, 120, 150, 180, 240, 300];

function ExerciseCard({
  se,
  session,
  exercise,
  barKg,
  plates: inventory,
  restS,
  open,
  onOpen,
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
  open: boolean;
  onOpen: () => void;
  onSession: (s: Session) => void;
  onSetSaved: (s: WorkoutSet, restS: number) => void;
  onCatalogChange: () => void;
}) {
  const { data: last } = useLoad(
    () => cachedGet<LastPerformance | null>(`/exercises/${se.exercise_id}/last?before_session=${session.id}`).catch(() => null),
    [se.exercise_id, session.id],
  );
  const lastWorking = last?.sets.filter((s) => s.set_type !== "warmup").at(-1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [rest, setRest] = useState(restS);
  const [info, setInfo] = useState(false);

  // Rekord ogłaszamy, gdy serwer potwierdzi serię (od razu online, po synchronizacji offline).
  useEffect(() => {
    const on = (ev: Event) => {
      const saved = (ev as CustomEvent<SavedSet>).detail;
      if (saved.session_exercise_id !== se.id) return;
      const beaten = saved.records.filter((r) => r.beat_previous);
      if (!beaten.length) return;
      const best = beaten.find((r) => r.record_type === "e1rm") ?? beaten[0]!;
      const name = best.record_type === "rep_max" ? `${best.reps}RM` : RECORD_NAMES[best.record_type];
      setBanner(`★ NOWY REKORD · ${name} ${best.record_type === "bodyweight_reps" ? best.value : `${kg(best.value)} kg`}`);
      navigator.vibrate?.(80);
    };
    window.addEventListener(SET_SYNCED, on);
    return () => window.removeEventListener(SET_SYNCED, on);
  }, [se.id]);

  const d: Draft = draft ?? draftFrom(se.sets.at(-1) ?? lastWorking, se.tracking);
  const update = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const step = (field: "weight" | "reps", by: number) => {
    const v = (num(d[field]) ?? 0) + by;
    update({ [field]: String(Math.max(field === "weight" && se.tracking === "bodyweight_reps" ? -300 : 0, Math.round(v * 100) / 100)) });
  };

  async function save() {
    setError(null);
    setBanner(null);
    const editing = d.editing ? se.sets.find((s) => s.id === d.editing) : undefined;
    const weight = num(d.weight);
    const reps = num(d.reps);
    const isReps = se.tracking === "weight_reps" || se.tracking === "bodyweight_reps";
    if (isReps && (reps == null || !Number.isInteger(reps) || reps < 0 || reps > 100)) return setError("Podaj liczbę powtórzeń 0–100.");
    if (weight != null && (Number.isNaN(weight) || weight > 1000)) return setError("Zły ciężar.");
    try {
      const { session: next, set } = await local.saveSet(
        session,
        se.id,
        {
          set_index: editing?.set_index ?? (se.sets.at(-1)?.set_index ?? -1) + 1,
          set_type: d.set_type,
          weight_kg: se.tracking === "weight_reps" ? weight : null,
          added_kg: se.tracking === "bodyweight_reps" ? weight : null,
          reps: isReps ? reps : null,
          duration_s: se.tracking === "duration" ? num(d.duration) : null,
          distance_m: se.tracking === "distance" ? num(d.distance) : null,
          rpe: d.rpe,
          completed_at: editing?.completed_at ?? new Date().toISOString(),
        },
        editing?.id,
      );
      onSession(next);
      if (!editing) onSetSaved(set, rest);
      // Po rozgrzewce następna zwykle robocza; typy specjalne też nie przechodzą dalej same.
      setDraft({ ...d, editing: null, rpe: null, set_type: "working" });
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function removeSet(id: string) {
    onSession(await local.deleteSet(session, id));
    setDraft({ ...d, editing: null });
  }

  async function removeExercise() {
    if (!confirm(`Usunąć ${se.name} z treningu?`)) return;
    onSession(await local.removeExercise(session, se.id));
  }

  function cycleRest() {
    const i = REST_OPTIONS.indexOf(rest);
    const next = REST_OPTIONS[(i + 1) % REST_OPTIONS.length]!;
    setRest(next);
    setRestFor(se.exercise_id, next);
  }

  const weightNum = num(d.weight);
  const plates =
    exercise?.equipment === "Sztanga" && se.tracking === "weight_reps" && weightNum && weightNum > barKg
      ? platesFor(weightNum, barKg, inventory)
      : null;
  const best = se.sets.reduce<number | null>((m, s) => (s.e1rm_kg != null && (m == null || s.e1rm_kg > m) ? s.e1rm_kg : m), null);
  let workingNo = 0;
  const planned = se.target ? (se.target.set_scheme?.length || se.target.target_sets) : 0;
  const done = se.sets.filter((s) => s.set_type !== "warmup").length;

  return (
    <Card className={`grid gap-3 ${open ? "border-accent/60" : ""}`}>
      <button onClick={onOpen} className="flex items-start justify-between gap-3 text-left" aria-expanded={open}>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-snug">{se.name}</p>
          {lastWorking && (
            <p className="font-mono text-sm text-cyan">
              ostatnio: {setLabel(lastWorking, se.tracking)}
              {lastWorking.rpe ? ` @ RPE ${lastWorking.rpe}` : ""}
            </p>
          )}
          {se.target && (
            <p className="font-mono text-sm text-accent">
              cel: {blockText(se.target)}
              {schemeText(se.target) ? ` (${schemeText(se.target)})` : ""}
            </p>
          )}
          {exercise?.notes && <p className="text-sm text-muted">📝 {exercise.notes}</p>}
        </div>
        <span className={`num shrink-0 text-sm ${planned && done >= planned ? "text-accent" : "text-muted"}`}>
          {planned ? `${done}/${planned} serii` : sets(se.sets.length)}
          {best ? ` · 1RM ${kg(best)}` : ""}
        </span>
      </button>

      {se.sets.length > 0 && (
        <ol className="grid gap-1">
          {se.sets.map((s) => {
            if (s.set_type !== "warmup") workingNo++;
            return (
              <li key={s.id}>
                <button
                  onClick={() => {
                    if (!open) onOpen();
                    setDraft({ ...draftFrom(s, se.tracking), editing: s.id, rpe: s.rpe, set_type: s.set_type });
                  }}
                  className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-lg px-2 py-2 text-left ${d.editing === s.id ? "bg-accent/15 outline outline-accent" : "active:bg-surface-2"}`}
                >
                  <span className={`num text-sm ${SET_MARK[s.set_type] ? "font-bold text-amber" : "text-muted"}`}>{s.set_type === "warmup" ? "R" : `${workingNo}${SET_MARK[s.set_type] ?? ""}`}</span>
                  <span className={`num text-lg font-semibold ${s.set_type === "warmup" ? "text-muted" : ""}`}>
                    {setLabel(s, se.tracking)}
                    {s.rpe ? <span className="text-sm text-muted"> @{s.rpe}</span> : null}
                  </span>
                  <span className="num text-sm text-muted">{s.e1rm_kg ? `≈${kg(s.e1rm_kg)}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {banner && <p className="rounded-xl border border-amber bg-amber/10 px-3 py-2 font-mono text-sm font-semibold text-amber">{banner}</p>}

      {open && (
        <div className="grid gap-3 border-t border-line pt-3">
          {(se.tracking === "weight_reps" || se.tracking === "bodyweight_reps") && (
            <>
              <Stepper
                label={se.tracking === "bodyweight_reps" ? "dociążenie kg (− = asysta)" : "kg"}
                value={d.weight}
                onChange={(v) => update({ weight: v })}
                onStep={(dir) => step("weight", dir * 2.5)}
                stepLabel="2.5"
                decimal
              />
              {plates && (
                <p className="font-mono text-sm text-muted">
                  na stronę: {plates.per_side.length ? plates.per_side.map((p) => kg(p, 2)).join(" + ") : "sam gryf"}
                  {!plates.exact && ` (najbliżej: ${kg(plates.total_kg)} kg)`}
                </p>
              )}
              <Stepper label="powtórzenia" value={d.reps} onChange={(v) => update({ reps: v })} onStep={(dir) => step("reps", dir)} stepLabel="1" />
            </>
          )}
          {se.tracking === "duration" && (
            <Stepper label="czas (s)" value={d.duration} onChange={(v) => update({ duration: v })} onStep={(dir) => update({ duration: String(Math.max(0, (num(d.duration) ?? 0) + dir * 5)) })} stepLabel="5" />
          )}
          {se.tracking === "distance" && (
            <Stepper label="dystans (m)" value={d.distance} onChange={(v) => update({ distance: v })} onStep={(dir) => update({ distance: String(Math.max(0, (num(d.distance) ?? 0) + dir * 50)) })} stepLabel="50" />
          )}

          <div className="grid gap-1.5">
            <span className="font-mono text-sm font-semibold text-muted">RPE (opcjonalnie)</span>
            <div className="flex flex-wrap gap-1.5">
              {[null, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => update({ rpe: v })}
                  className={`num min-h-11 min-w-11 rounded-lg border px-2 text-base font-semibold ${d.rpe === v ? "border-accent bg-accent text-accent-ink" : "border-line text-fg"}`}
                >
                  {v ?? "–"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="font-mono text-sm font-semibold text-muted">typ serii</span>
            <div className="flex flex-wrap gap-1.5">
              {SET_TYPES.map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => update({ set_type: t })}
                  className={`min-h-10 rounded-full border px-3 font-mono text-sm font-semibold ${d.set_type === t ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {d.set_type === "warmup" && <span className="text-sm text-muted">Rozgrzewka nie liczy się do rekordów ani objętości.</span>}
          </div>

          <ErrorText>{error}</ErrorText>
          <Button onClick={() => void save()} className="min-h-14 text-lg">
            {d.editing ? "✓ Popraw serię" : "✓ Zapisz serię"}
          </Button>
          {d.editing ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setDraft({ ...d, editing: null })}>
                Anuluj
              </Button>
              <Button variant="danger" onClick={() => void removeSet(d.editing!)}>
                Usuń serię
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button onClick={cycleRest} className="min-h-11 rounded-lg border border-line px-3 font-mono text-sm" aria-label="Przerwa po serii tego ćwiczenia">
                ⏱ przerwa {clock(rest)}
              </button>
              <button onClick={() => setInfo(!info)} className="min-h-11 rounded-lg border border-line px-3 font-mono text-sm">
                📷 maszyna{exercise?.photos.length ? ` (${exercise.photos.length})` : ""}
              </button>
              <button onClick={() => void removeExercise()} className="min-h-11 font-mono text-sm text-muted underline-offset-4 hover:underline">
                usuń z treningu
              </button>
            </div>
          )}
          {info && exercise && <ExerciseInfo exercise={exercise} onChange={onCatalogChange} />}
        </div>
      )}
    </Card>
  );
}

function Stepper({
  label,
  value,
  onChange,
  onStep,
  stepLabel,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onStep: (dir: 1 | -1) => void;
  stepLabel: string;
  decimal?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="font-mono text-sm font-semibold text-muted">{label}</span>
      <div className="grid grid-cols-[4rem_1fr_4rem] gap-2">
        <button onClick={() => onStep(-1)} className="num min-h-14 rounded-xl border border-line bg-surface-2 text-lg font-semibold active:bg-line">
          −{stepLabel}
        </button>
        <input
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-label={label}
          className="num min-h-14 w-full min-w-0 rounded-xl border border-line bg-bg text-center text-3xl font-bold outline-none focus:border-accent"
        />
        <button onClick={() => onStep(1)} className="num min-h-14 rounded-xl border border-line bg-surface-2 text-lg font-semibold active:bg-line">
          +{stepLabel}
        </button>
      </div>
    </div>
  );
}
