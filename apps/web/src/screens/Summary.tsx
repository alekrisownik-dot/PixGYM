import { NetworkError, type Summary as SummaryData } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet, loadSession } from "../offline/sessions";
import { pendingSessionIds } from "../offline/sync";
import { setTonnage } from "../domain";
import { Card, ErrorText, Loading, Screen, clock, kg, longDate, tonnage, sets } from "../ui/kit";

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

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="grid gap-0.5 p-3">
      <span className="font-mono text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="num text-2xl font-bold">{value}</span>
      {sub && <span className="num text-sm text-accent">{sub}</span>}
    </Card>
  );
}

export function Summary({ id }: { id: string }) {
  const { data, error } = useLoad(() => loadSummary(id), [id]);
  if (error) return <Screen title="Podsumowanie"><ErrorText>{error}</ErrorText></Screen>;
  if (!data) return <Loading />;
  const s = data.data;
  const diff = s.previous_tonnage_kg ? (s.tonnage_kg - s.previous_tonnage_kg) / s.previous_tonnage_kg : null;

  return (
    <Screen title="Dobra robota" sub={<span className="first-letter:uppercase">{longDate(s.local_date)}</span>}>
      {s.records.length > 0 && (
        <Card className="grid gap-2 border-amber bg-amber/10">
          <p className="font-mono font-bold text-amber">★ {s.records.length === 1 ? "Nowy rekord" : `${s.records.length} nowe rekordy`}</p>
          {s.records.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span>
                {r.name} <span className="font-mono text-sm text-muted">{r.record_type === "rep_max" ? `${r.reps}RM` : RECORD[r.record_type]}</span>
              </span>
              <span className="num font-bold text-amber">{r.record_type === "bodyweight_reps" ? `${r.value} powt.` : `${kg(r.value)} kg`}</span>
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Czas" value={clock(s.duration_s)} />
        <Tile
          label="Tonaż"
          value={tonnage(s.tonnage_kg)}
          sub={diff != null ? `${diff >= 0 ? "+" : ""}${Math.round(diff * 100)}% vs poprzedni` : undefined}
        />
        <Tile label="Serie" value={String(s.sets)} />
        <Tile label="Powtórzenia" value={String(s.reps)} />
      </div>

      <section className="grid gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Ćwiczenia</h2>
        <Card className="grid p-0">
          {s.exercises.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="min-w-0">
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

      {data.local && <p className="text-sm text-muted">Trening czeka na wysłanie na serwer. Rekordy i porównanie pojawią się po synchronizacji.</p>}

      <div className="grid grid-cols-2 gap-2">
        <a href={href({ name: "workout", id: s.id })} className="grid min-h-12 place-items-center rounded-xl border border-line font-mono font-semibold">
          szczegóły
        </a>
        <a href={href({ name: "today" })} className="grid min-h-12 place-items-center rounded-xl bg-accent font-mono font-bold text-accent-ink">
          gotowe
        </a>
      </div>
    </Screen>
  );
}
