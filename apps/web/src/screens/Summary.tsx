import { useMemo, useState } from "react";

import { NetworkError, type Exercise, type Me, type Summary as SummaryData } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet, listSessions, loadSession } from "../offline/sessions";
import { pendingSessionIds } from "../offline/sync";
import { setTonnage } from "../domain";
import { Card, ErrorText, Loading, Screen, SectionTitle, Tile, clock, kg, longDate, sets, tonnage } from "../ui/kit";
import { IconTrophy } from "../ui/icons";
import { BitSays } from "../ui/mascot";
import { useTheme } from "../ui/theme";
import { ExerciseArt } from "../ui/exercise-art";
import { ShareSheet, type ShareCard } from "../ui/share-card";

/** Obrazek do udostępnienia: rekordy, a bez nich tonaż i najlepsze ćwiczenie. */
function shareCard(s: SummaryData, name: string | undefined): ShareCard {
  const recordValue = (r: SummaryData["records"][number]) => (r.record_type === "bodyweight_reps" ? `${r.value} powt.` : `${kg(r.value)} kg`);
  const recordType = (r: SummaryData["records"][number]) => (r.record_type === "rep_max" ? `${r.reps}RM` : RECORD[r.record_type]);
  const footer = [name, longDate(s.local_date)].filter(Boolean).join(" · ");
  const kicker = `${clock(s.duration_s)} · ${sets(s.sets)}`;
  if (s.records.length) {
    const [first] = s.records;
    return {
      kicker,
      tone: "amber",
      title: s.records.length === 1 ? `Nowy rekord ${recordType(first!)}` : `Nowe rekordy: ${s.records.length}`,
      big: recordValue(first!),
      lines: s.records.length === 1 ? [[first!.name, recordType(first!) ?? ""], ["tonaż treningu", tonnage(s.tonnage_kg)]] : s.records.map((r) => [`${r.name} ${recordType(r)}`, recordValue(r)]),
      footer,
      mood: "flex",
    };
  }
  const best = s.exercises.filter((e) => e.best_e1rm_kg != null).sort((a, b) => b.best_e1rm_kg! - a.best_e1rm_kg!)[0];
  return {
    kicker,
    tone: "accent",
    title: "Trening zaliczony",
    big: tonnage(s.tonnage_kg),
    lines: [
      ["powtórzenia", String(s.reps)],
      ["ćwiczenia", String(s.exercises.filter((e) => e.sets > 0).length)],
      ...(best ? [[`${best.name} 1RM szac.`, `${kg(best.best_e1rm_kg)} kg`] as [string, string]] : []),
    ],
    footer,
    mood: "flex",
  };
}

const RECORD: Record<string, string> = {
  e1rm: "1RM szac.",
  one_rm: "1RM",
  set_volume: "największa seria",
  bodyweight_reps: "powtórzenia",
};

/** Bez sieci (albo zanim trening dojdzie na serwer) liczymy podsumowanie z lokalnej kopii. */
async function loadSummary(id: string): Promise<{ data: SummaryData; local: boolean }> {
  if (!(await pendingSessionIds()).has(id)) {
    try {
      return { data: await cachedGet<SummaryData>(`/sessions/${id}/summary`), local: false };
    } catch (e) {
      if (!(e instanceof NetworkError)) throw e;
    }
  }
  const s = await loadSession(id);
  const exercises = s.exercises.map((e) => {
    const working = e.sets.filter((x) => x.set_type !== "warmup");
    return {
      exercise_id: e.exercise_id,
      name: e.name,
      sets: working.length,
      tonnage_kg: working.reduce((t, x) => t + setTonnage(x.set_type, x.effective_kg, x.reps), 0),
      best_e1rm_kg: working.reduce<number | null>((m, x) => (x.e1rm_kg != null && (m == null || x.e1rm_kg > m) ? x.e1rm_kg : m), null),
    };
  });
  const working = s.exercises.flatMap((e) => e.sets).filter((x) => x.set_type !== "warmup");
  const end = s.ended_at ? new Date(s.ended_at) : new Date();
  return {
    local: true,
    data: {
      id: s.id,
      local_date: s.local_date,
      duration_s: Math.round((end.getTime() - new Date(s.started_at).getTime()) / 1000),
      sets: working.length,
      reps: working.reduce((t, x) => t + (x.reps ?? 0), 0),
      tonnage_kg: exercises.reduce((t, e) => t + e.tonnage_kg, 0),
      exercises,
      records: [],
      previous_date: null,
      previous_tonnage_kg: null,
    },
  };
}

export function Summary({ id }: { id: string }) {
  const { data, error } = useLoad(() => loadSummary(id), [id]);
  const list = useLoad(() => listSessions(200), []);
  const evil = useTheme() === "red";
  const catalog = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const me = useLoad(() => cachedGet<Me>("/me").catch(() => undefined), []);
  const [sharing, setSharing] = useState(false);
  const card = useMemo(() => (data ? shareCard(data.data, me.data?.display_name) : null), [data, me.data]);
  if (error) return <Screen title="Podsumowanie"><ErrorText>{error}</ErrorText></Screen>;
  if (!data) return <Loading />;
  const s = data.data;
  const diff = s.previous_tonnage_kg ? (s.tonnage_kg - s.previous_tonnage_kg) / s.previous_tonnage_kg : null;
  // Średnia z wcześniejszych treningów (bez tego), do porównania „na tle średniej”.
  const others = (list.data ?? []).filter((x) => x.id !== s.id && x.ended_at && x.set_count > 0);
  const average = others.length >= 2 ? others.reduce((t, x) => t + x.tonnage_kg, 0) / others.length : null;
  const vsAvg = average ? (s.tonnage_kg - average) / average : null;

  return (
    <Screen kicker="trening zakończony" title="Dobra robota" sub={<span className="first-letter:uppercase">{longDate(s.local_date)}</span>}>
      <BitSays mood="flex">
        {evil ? (
          s.records.length ? (
            <>Nowy rekord. Testy antydopingowe nic nie wykażą… <b className="text-accent">chyba</b>.</>
          ) : vsAvg != null && vsAvg > 0.05 ? (
            <>Tonaż <b className="text-accent">{Math.round(vsAvg * 100)}% powyżej</b> średniej. Natty? Komisja sprawdzi.</>
          ) : (
            <>{sets(s.sets)} w logach. Teraz białko, sen i zero podejrzanych tabletek.</>
          )
        ) : s.records.length
          ? <>Nowy rekord! Zapisuję w logach i podbijam ranking.</>
          : vsAvg != null && vsAvg > 0.05
            ? <>Tonaż <b className="text-accent">{Math.round(vsAvg * 100)}% powyżej</b> Twojej średniej. Rośniesz!</>
            : diff != null && diff > 0
              ? <>Tonaż <b className="text-accent">+{Math.round(diff * 100)}%</b> względem poprzedniego. Rośniesz!</>
            : <>{sets(s.sets)} na koncie. Teraz białko i sen.</>}
      </BitSays>
      {s.records.length > 0 && (
        <div className="pop grid gap-2.5 rounded-2xl border border-amber/70 bg-gradient-to-b from-amber/15 to-amber/5 p-4 shadow-[0_12px_32px_-16px_rgba(255,190,92,.5)]">
          <p className="flex items-center gap-2 font-mono font-bold text-amber">
            <IconTrophy size={20} /> {s.records.length === 1 ? "Nowy rekord" : `Nowe rekordy: ${s.records.length}`}
          </p>
          {s.records.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 border-t border-amber/20 pt-2">
              <span>
                {r.name} <span className="font-mono text-xs text-muted">{r.record_type === "rep_max" ? `${r.reps}RM` : RECORD[r.record_type]}</span>
              </span>
              <span className="num font-bold text-amber">{r.record_type === "bodyweight_reps" ? `${r.value} powt.` : `${kg(r.value)} kg`}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tonaż tego treningu na tle średniej i poprzedniego: paski w tej samej skali. */}
      <div className="card grid gap-3 p-4">
        <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-muted">podniesione kilogramy</span>
        <span className="num -mt-1 text-[40px] leading-none font-bold text-accent">{tonnage(s.tonnage_kg)}</span>
        {(average != null || s.previous_tonnage_kg != null) && (
          <div className="grid gap-2">
            {[
              ["ten trening", s.tonnage_kg, "bg-accent"],
              ...(average != null ? [["Twoja średnia", average, "bg-amber/80"] as const] : []),
              ...(s.previous_tonnage_kg != null ? [["poprzedni", s.previous_tonnage_kg, "bg-fg/30"] as const] : []),
            ].map(([label, v, color]) => {
              const max = Math.max(s.tonnage_kg, average ?? 0, s.previous_tonnage_kg ?? 0) || 1;
              return (
                <div key={label as string} className="grid grid-cols-[7.5rem_1fr_3.75rem] items-center gap-2.5">
                  <span className="text-[14px] text-muted">{label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${((v as number) / max) * 100}%` }} />
                  </div>
                  <span className="num text-right text-[14px] font-semibold">{tonnage(v as number)}</span>
                </div>
              );
            })}
          </div>
        )}
        {vsAvg != null && (
          <p className={`text-[15px] font-semibold ${vsAvg >= 0 ? "text-accent" : "text-muted"}`}>
            {vsAvg >= 0 ? `${Math.round(vsAvg * 100)}% więcej niż średnio` : `${Math.round(-vsAvg * 100)}% mniej niż średnio`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="czas" value={clock(s.duration_s)} />
        <Tile label="serie" value={String(s.sets)} />
        <Tile label="powt." value={String(s.reps)} />
      </div>

      <section className="grid gap-2">
        <SectionTitle>Ćwiczenia</SectionTitle>
        <Card className="grid p-0">
          {s.exercises.filter((e) => e.sets > 0).map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 last:border-0">
              <ExerciseArt exercise={catalog.data?.find((c) => c.id === e.exercise_id) ?? e} size={52} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{e.name}</p>
                <p className="num text-sm text-muted">
                  {sets(e.sets)} · {tonnage(e.tonnage_kg)}
                </p>
              </div>
              {e.best_e1rm_kg != null && (
                <span className="num text-right">
                  <span className="block text-lg font-bold">{kg(e.best_e1rm_kg)}</span>
                  <span className="block font-mono text-xs text-muted">1RM szac.</span>
                </span>
              )}
            </div>
          ))}
        </Card>
      </section>

      {s.exercises.some((e) => e.sets === 0) && (
        <p className="-mt-2 px-1 text-[13px] text-muted">Pominięte: {s.exercises.filter((e) => e.sets === 0).map((e) => e.name).join(", ")}.</p>
      )}
      {data.local && <p className="text-sm text-muted">Trening czeka na wysłanie na serwer. Rekordy i porównanie pojawią się po synchronizacji.</p>}

      <button
        onClick={() => setSharing(true)}
        className={`flex min-h-13 items-center justify-center gap-2 rounded-xl border-2 font-mono font-bold ${s.records.length ? "border-amber/70 text-amber" : "border-accent/60 text-accent"}`}
      >
        📸 Pochwal się{s.records.length ? " rekordem" : ""}
      </button>
      {sharing && card && <ShareSheet card={card} fileName={`pixgym-${s.local_date}.png`} onClose={() => setSharing(false)} />}

      <div className="grid grid-cols-2 gap-2.5">
        <a href={href({ name: "workout", id: s.id })} className="card grid min-h-13 place-items-center font-mono font-semibold">
          szczegóły
        </a>
        <a href={href({ name: "today" })} className="grid min-h-13 place-items-center rounded-xl bg-accent font-mono font-bold text-accent-ink shadow-[0_10px_28px_-12px_rgb(var(--accent-rgb)/.55)]">
          gotowe
        </a>
      </div>
    </Screen>
  );
}
