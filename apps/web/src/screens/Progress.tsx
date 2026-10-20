import { type Rank, type TrainedExercise } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { Card, Empty, ErrorText, Loading, ProgressBar, Screen, kg, shortDate } from "../ui/kit";

export function RankCard({ r }: { r: Rank }) {
  return (
    <Card className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{r.name}</span>
        <span className="num text-sm text-muted">{r.ratio != null ? `${r.ratio}× masa ciała` : ""}</span>
      </div>
      {r.title ? (
        <>
          <p className="font-mono text-xl font-bold text-accent">{r.title}</p>
          {r.next_title ? (
            <>
              <ProgressBar value={r.progress ?? 0} />
              <p className="text-sm text-muted">
                następna: <span className="font-mono text-fg">{r.next_title}</span> przy 1RM {kg(r.next_at_kg)} kg
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">najwyższa ranga</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Brak rangi: potrzebny wynik i masa ciała (wpisz ją w treningu).</p>
      )}
    </Card>
  );
}

export function Progress() {
  const exercises = useLoad(() => cachedGet<TrainedExercise[]>("/progress/exercises"), []);
  const ranks = useLoad(() => cachedGet<Rank[]>("/ranks"), []);

  return (
    <Screen title="Postęp" sub="rangi i ćwiczenia">
      <ErrorText>{exercises.error ?? ranks.error}</ErrorText>

      <section className="grid gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Rangi</h2>
        {!ranks.data && !ranks.error && <Loading />}
        {ranks.data?.map((r) => <RankCard key={r.lift} r={r} />)}
      </section>

      <section className="grid gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Ćwiczenia</h2>
        {!exercises.data && !exercises.error && <Loading />}
        {exercises.data?.length === 0 && <Empty>Po pierwszym treningu pojawią się tu wykresy i rekordy.</Empty>}
        {exercises.data?.map((e) => (
          <a key={e.id} href={href({ name: "exercise", id: e.id })} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 active:bg-surface-2">
            <div className="min-w-0">
              <p className="font-semibold">{e.name}</p>
              <p className="text-sm text-muted">
                {e.sessions}× · ostatnio {shortDate(e.last_date)}
              </p>
            </div>
            {e.e1rm_kg != null && (
              <div className="text-right">
                <p className="num text-xl font-bold">{kg(e.e1rm_kg)}</p>
                <p className="font-mono text-xs text-muted">1RM szac.</p>
              </div>
            )}
          </a>
        ))}
      </section>
    </Screen>
  );
}
