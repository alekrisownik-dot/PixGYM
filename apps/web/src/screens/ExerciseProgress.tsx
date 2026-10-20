import { type Exercise, type ExerciseRecord } from "../api";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { Card, Empty, ErrorText, Loading, Screen, kg, shortDate } from "../ui/kit";

interface Point {
  date: string;
  e1rm_kg: number;
}

const RECORD_ORDER = ["one_rm", "e1rm", "rep_max", "set_volume", "bodyweight_reps"];

function recordName(r: ExerciseRecord): string {
  switch (r.record_type) {
    case "one_rm":
      return "1RM (prawdziwy)";
    case "e1rm":
      return "1RM szacowany";
    case "rep_max":
      return `${r.reps}RM`;
    case "set_volume":
      return "Największa seria";
    case "bodyweight_reps":
      return "Powtórzenia bez obciążenia";
  }
}

function Chart({ points }: { points: Point[] }) {
  const W = 320;
  const H = 160;
  const padL = 34;
  const padB = 20;
  const values = points.map((p) => p.e1rm_kg);
  const lo = Math.floor(Math.min(...values) * 0.97);
  const hi = Math.ceil(Math.max(...values) * 1.03);
  const t0 = new Date(points[0]!.date).getTime();
  const t1 = new Date(points.at(-1)!.date).getTime();
  const x = (d: string) => padL + (t1 === t0 ? (W - padL) / 2 : ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - padL - 8));
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - padB - 8);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.e1rm_kg).toFixed(1)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = points.at(-1)!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Szacowany 1RM: od ${kg(points[0]!.e1rm_kg)} do ${kg(last.e1rm_kg)} kg`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
          <text x={0} y={y(t) + 4} fontSize="11" fill="var(--color-muted)" fontFamily="var(--font-mono)">
            {Math.round(t)}
          </text>
        </g>
      ))}
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.e1rm_kg)} r="3" fill="var(--color-accent)" />
      ))}
      <circle cx={x(last.date)} cy={y(last.e1rm_kg)} r="5" fill="var(--color-amber)" stroke="var(--color-bg)" strokeWidth="2" />
      <text x={padL} y={H - 4} fontSize="11" fill="var(--color-muted)" fontFamily="var(--font-mono)">
        {shortDate(points[0]!.date)}
      </text>
      <text x={W} y={H - 4} fontSize="11" fill="var(--color-muted)" fontFamily="var(--font-mono)" textAnchor="end">
        {shortDate(last.date)}
      </text>
    </svg>
  );
}

export function ExerciseProgress({ id }: { id: string }) {
  const history = useLoad(() => cachedGet<Point[]>(`/exercises/${id}/e1rm`), [id]);
  const records = useLoad(() => cachedGet<ExerciseRecord[]>(`/exercises/${id}/records`), [id]);
  const catalog = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const name = catalog.data?.find((e) => e.id === id)?.name ?? "Ćwiczenie";
  const sorted = [...(records.data ?? [])].sort(
    (a, b) => RECORD_ORDER.indexOf(a.record_type) - RECORD_ORDER.indexOf(b.record_type) || (a.reps ?? 0) - (b.reps ?? 0),
  );
  const points = history.data ?? [];
  const change = points.length > 1 ? points.at(-1)!.e1rm_kg - points[0]!.e1rm_kg : null;

  return (
    <Screen title={name} sub={<a href="#/postep" className="text-accent">← postęp</a>}>
      <ErrorText>{history.error ?? records.error}</ErrorText>
      <Card className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-sm font-semibold text-muted">1RM SZACOWANY</span>
          {change != null && (
            <span className={`num text-sm font-semibold ${change >= 0 ? "text-accent" : "text-danger"}`}>
              {change >= 0 ? "+" : ""}
              {kg(change)} kg
            </span>
          )}
        </div>
        {!history.data && !history.error && <Loading />}
        {points.length > 0 ? <Chart points={points} /> : history.data && <Empty>Brak serii, z których da się policzyć 1RM.</Empty>}
      </Card>

      <section className="grid gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Rekordy</h2>
        <Card className="grid">
          {sorted.length === 0 && records.data && <Empty>Brak rekordów.</Empty>}
          {sorted.map((r) => (
            <div key={`${r.record_type}-${r.reps}`} className="flex items-baseline justify-between border-b border-line py-3 last:border-0">
              <div>
                <p className="font-semibold">{recordName(r)}</p>
                <p className="font-mono text-xs text-muted">{shortDate(r.achieved_at)}</p>
              </div>
              <span className="num text-xl font-bold">
                {r.record_type === "bodyweight_reps" ? `${r.value} powt.` : `${kg(r.value)} kg`}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </Screen>
  );
}
