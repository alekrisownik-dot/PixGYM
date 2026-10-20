import { useEffect, useState } from "react";

import { api, errorText, type Exercise, type Plan, type PlanBlock, type PlanDay } from "../api";
import { go } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { Button, Card, ErrorText, Loading, Screen, Segmented, clock, SectionTitle } from "../ui/kit";
import { ExerciseArt } from "../ui/exercise-art";
import { DAY_ICONS, autoDayIcon, dayIconInfo, type DayIcon } from "../ui/muscles";
import { PixelIcon } from "../ui/pixel-icons";
import { ExercisePicker } from "./ExercisePicker";
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, blockText, schemeText } from "./plan-format";

const REST = [null, 60, 90, 120, 150, 180, 240, 300] as const;
const RPE = [null, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

const next = <T,>(list: readonly T[], value: T) => list[(list.indexOf(value) + 1) % list.length]!;

function Mini({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="grid gap-1">
      <span className="font-mono text-xs font-semibold text-muted">{label}</span>
      <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-1">
        <button onClick={onMinus} className="min-h-11 rounded-lg border border-line bg-surface-2 font-mono text-lg" aria-label={`${label} mniej`}>
          −
        </button>
        <span className="num text-center text-xl font-bold">{value}</span>
        <button onClick={onPlus} className="min-h-11 rounded-lg border border-line bg-surface-2 font-mono text-lg" aria-label={`${label} więcej`}>
          +
        </button>
      </div>
    </div>
  );
}

function BlockCard({
  block,
  exercise,
  index,
  count,
  readOnly,
  onChange,
  onMove,
  onRemove,
}: {
  block: PlanBlock;
  exercise?: Exercise;
  index: number;
  count: number;
  readOnly: boolean;
  onChange: (b: PlanBlock) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<PlanBlock>) => onChange({ ...block, ...patch });
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const scheme = schemeText(block);

  return (
    <Card className={`grid gap-3 p-3 ${open ? "border-accent/60" : ""}`}>
      <div className="flex items-start gap-2">
        <span className="relative shrink-0">
          <ExerciseArt exercise={exercise ?? block} size={58} />
          <span className="num absolute -top-2 -left-2 grid size-5 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-ink ring-2 ring-surface">{index + 1}</span>
        </span>
        <button className="min-w-0 flex-1 text-left" onClick={() => !readOnly && setOpen(!open)} aria-expanded={open}>
          <p className="font-bold leading-snug">{block.name}</p>
          <p className="font-mono text-sm text-cyan">
            {blockText(block)}
            {block.rest_s ? ` · przerwa ${clock(block.rest_s)}` : ""}
          </p>
          {scheme && <p className="font-mono text-xs text-muted">{scheme}</p>}
        </button>
        {!readOnly && (
          <div className="flex shrink-0 gap-1">
            <button onClick={() => onMove(-1)} disabled={index === 0} className="size-10 rounded-lg border border-line font-mono disabled:opacity-30" aria-label="W górę">
              ↑
            </button>
            <button onClick={() => onMove(1)} disabled={index === count - 1} className="size-10 rounded-lg border border-line font-mono disabled:opacity-30" aria-label="W dół">
              ↓
            </button>
          </div>
        )}
      </div>

      {open && !readOnly && (
        <div className="grid gap-3 border-t border-line pt-3">
          {!block.set_scheme?.length && (
            <>
              <Mini label="serie" value={String(block.target_sets)} onMinus={() => set({ target_sets: clamp(block.target_sets - 1, 1, 20) })} onPlus={() => set({ target_sets: clamp(block.target_sets + 1, 1, 20) })} />
              <div className="grid grid-cols-2 gap-2">
                <Mini
                  label="powt. od"
                  value={String(block.rep_min ?? 1)}
                  onMinus={() => set({ rep_min: clamp((block.rep_min ?? 1) - 1, 1, 100) })}
                  onPlus={() => {
                    const v = clamp((block.rep_min ?? 1) + 1, 1, 100);
                    set({ rep_min: v, rep_max: block.rep_max != null ? Math.max(v, block.rep_max) : null });
                  }}
                />
                <Mini
                  label="powt. do"
                  value={block.rep_max == null ? "max" : String(block.rep_max)}
                  onMinus={() => set({ rep_max: block.rep_max == null ? (block.rep_min ?? 1) + 4 : block.rep_max <= (block.rep_min ?? 1) ? null : block.rep_max - 1 })}
                  onPlus={() => set({ rep_max: block.rep_max == null ? null : clamp(block.rep_max + 1, 1, 100) })}
                />
              </div>
              <p className="-mt-1 text-xs text-muted">„max” = tyle, ile dasz radę (AMRAP).</p>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => set({ rest_s: next(REST, block.rest_s as (typeof REST)[number]) })} className="min-h-11 rounded-lg border border-line font-mono text-sm">
              ⏱ {block.rest_s ? clock(block.rest_s) : "przerwa domyślna"}
            </button>
            <button onClick={() => set({ target_rpe: next(RPE, block.target_rpe as (typeof RPE)[number]) })} className="min-h-11 rounded-lg border border-line font-mono text-sm">
              {block.target_rpe ? `RPE ${block.target_rpe}` : "RPE: bez celu"}
            </button>
          </div>
          <button onClick={onRemove} className="min-h-11 justify-self-start font-mono text-sm text-danger">
            usuń bloczek
          </button>
        </div>
      )}
    </Card>
  );
}

const newBlock = (e: Exercise): PlanBlock => ({
  exercise_id: e.id,
  name: e.name,
  tracking: e.tracking,
  target_sets: 3,
  rep_min: e.tracking === "duration" || e.tracking === "distance" ? 1 : 8,
  rep_max: e.tracking === "duration" || e.tracking === "distance" ? 1 : 12,
  target_rpe: null,
  rest_s: null,
  superset_group: null,
  set_scheme: null,
  progression_rule_id: null,
  notes: null,
});

/** Ikonka dnia (na kole planu): „auto” dobiera ją z ćwiczeń. */
function DayIconPicker({ value, auto, onChange }: { value: DayIcon | null; auto: DayIcon | null; onChange: (v: DayIcon | null) => void }) {
  const shown = value ?? auto;
  return (
    <div className="grid gap-1.5">
      <span className="font-mono text-xs font-semibold text-muted">ikonka na kole</span>
      <div className="grid grid-cols-4 gap-1.5">
        <button
          onClick={() => onChange(null)}
          className={`grid min-h-16 place-items-center content-center gap-1 rounded-xl border text-[11px] font-semibold ${value == null ? "border-accent bg-accent/15 text-accent" : "border-line text-muted"}`}
          aria-pressed={value == null}
        >
          {auto ? <PixelIcon name={`m_${auto}`} size={26} accent={dayIconInfo(auto).color} className="text-fg" /> : <span className="font-mono text-lg">?</span>}
          auto
        </button>
        {DAY_ICONS.map((d) => (
          <button
            key={d.key}
            onClick={() => onChange(d.key)}
            className={`grid min-h-16 place-items-center content-center gap-1 rounded-xl border text-[11px] font-semibold ${value === d.key ? "bg-surface-2" : "border-line text-muted"}`}
            style={value === d.key ? { borderColor: d.color, color: d.color } : undefined}
            aria-pressed={value === d.key}
            aria-label={`Ikonka: ${d.name}${shown === d.key && value == null ? " (dobrana automatycznie)" : ""}`}
          >
            <PixelIcon name={`m_${d.key}`} size={26} accent={d.color} className="text-fg" />
            {d.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const SCHEDULES = [
  ["weekdays", "Stałe dni"],
  ["flexible", "Elastycznie"],
] as const;

const toPayload = (plan: Plan) => ({
  name: plan.name,
  description: plan.description,
  schedule: plan.schedule,
  days: plan.days.map((d) => ({
    name: d.name,
    weekdays: d.weekdays,
    icon: d.icon ?? null,
    blocks: d.blocks.map(({ id: _id, name: _n, tracking: _t, ...b }) => b),
  })),
});

export function PlanEditor({ id }: { id: string }) {
  const { data, error } = useLoad(() => cachedGet<Plan>(`/programs/${id}`), [id]);
  const catalog = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const { data: recent } = useLoad(() => cachedGet<{ id: string }[]>("/progress/exercises"), []);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !plan) setPlan(structuredClone(data));
  }, [data, plan]);

  // Niezapisane zmiany: ostrzeżenie przy zamykaniu karty.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (error) return <Screen title="Plan"><ErrorText>{error}</ErrorText></Screen>;
  if (!plan) return <Loading />;

  const readOnly = plan.builtin;
  const flexible = plan.schedule === "flexible";
  const day: PlanDay | undefined = plan.days[dayIdx];
  const update = (p: Plan) => {
    setPlan(p);
    setDirty(true);
    setSaved(false);
  };
  const updateDay = (patch: Partial<PlanDay>) => update({ ...plan, days: plan.days.map((d, i) => (i === dayIdx ? { ...d, ...patch } : d)) });
  const setBlocks = (blocks: PlanBlock[]) => updateDay({ blocks });

  function addDay(weekday?: number) {
    const name = weekday != null ? WEEKDAYS_LONG[weekday]! : `Dzień ${plan!.days.length + 1}`;
    update({ ...plan!, days: [...plan!.days, { name, weekdays: weekday != null ? [weekday] : [], blocks: [] }] });
    setDayIdx(plan!.days.length);
  }

  function toggleWeekday(w: number) {
    if (!day) return;
    // Jeden dzień tygodnia = jeden trening: zabieramy go innemu dniowi planu.
    const has = day.weekdays.includes(w);
    update({
      ...plan!,
      days: plan!.days.map((d, i) =>
        i === dayIdx
          ? { ...d, weekdays: has ? d.weekdays.filter((x) => x !== w) : [...d.weekdays, w].sort() }
          : { ...d, weekdays: has ? d.weekdays : d.weekdays.filter((x) => x !== w) },
      ),
    });
  }

  function moveDay(dir: -1 | 1) {
    const days = [...plan!.days];
    [days[dayIdx], days[dayIdx + dir]] = [days[dayIdx + dir]!, days[dayIdx]!];
    update({ ...plan!, days });
    setDayIdx(dayIdx + dir);
  }

  function removeDay() {
    if (!day || plan!.days.length === 1) return;
    if (day.blocks.length && !confirm(`Usunąć dzień „${day.name}” z ${day.blocks.length} bloczkami?`)) return;
    update({ ...plan!, days: plan!.days.filter((_, i) => i !== dayIdx) });
    setDayIdx(Math.max(0, dayIdx - 1));
  }

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      const fresh = await api.put<Plan>(`/programs/${plan!.id}`, toPayload(plan!));
      setPlan(fresh);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    setBusy(true);
    try {
      const mine = await api.post<Plan>(`/programs/${plan!.id}/copy`);
      go({ name: "plan", id: mine.id }, true);
    } catch (e) {
      setSaveError(errorText(e));
      setBusy(false);
    }
  }

  async function toggleActive() {
    try {
      await api.put("/me/active-program", { program_id: plan!.active ? null : plan!.id });
      setPlan({ ...plan!, active: !plan!.active });
    } catch (e) {
      setSaveError(errorText(e));
    }
  }

  async function removePlan() {
    if (!confirm(`Usunąć plan „${plan!.name}”? Zrobione treningi zostaną.`)) return;
    try {
      await api.del(`/programs/${plan!.id}`);
      go({ name: "plans" }, true);
    } catch (e) {
      setSaveError(errorText(e));
    }
  }

  const byWeekday = WEEKDAYS_SHORT.map((_, w) => plan.days.findIndex((d) => d.weekdays.includes(w)));

  return (
    <Screen kicker={readOnly ? "gotowy plan" : "edycja planu"} title={readOnly ? plan.name : "Twój plan"} sub={<a href="#/plany" className="text-accent">← plany</a>}>
      {readOnly ? (
        <Card className="grid gap-3">
          <p className="text-muted">{plan.description}</p>
          <Button onClick={() => void copy()} disabled={busy}>
            Użyj tego planu (kopia do edycji)
          </Button>
        </Card>
      ) : (
        <input
          value={plan.name}
          onChange={(e) => update({ ...plan, name: e.target.value })}
          maxLength={100}
          aria-label="Nazwa planu"
          className="min-h-12 rounded-xl border border-line bg-surface px-3 font-mono text-xl font-bold outline-none focus:border-accent"
        />
      )}

      {!readOnly && (
        <section className="grid gap-2">
          <SectionTitle>Jak trenujesz?</SectionTitle>
          <Segmented
            value={plan.schedule}
            options={SCHEDULES}
            onChange={(v) => update({ ...plan, schedule: v })}
            full
          />
          <p className="px-1 text-[15px] text-muted">
            {flexible
              ? "Treningi robisz po kolei, w dowolne dni. Zrobiony trening zalicza dzień planu w tym tygodniu, a „Dziś” podpowiada następny."
              : "Każdy trening ma swoje dni tygodnia, np. klatka w poniedziałek."}
          </p>
        </section>
      )}

      {/* Tydzień: który trening w który dzień. Pusty dzień = odpoczynek; dotknij, żeby dodać trening. */}
      {!flexible && (
      <section className="grid gap-2">
        <SectionTitle>Tydzień</SectionTitle>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS_SHORT.map((w, i) => {
            const di = byWeekday[i]!;
            const selected = di >= 0 && di === dayIdx;
            return (
              <button
                key={w}
                onClick={() => (di >= 0 ? setDayIdx(di) : !readOnly && addDay(i))}
                className={`grid min-h-16 content-start gap-0.5 rounded-lg border p-1 text-center ${
                  di >= 0 ? (selected ? "border-accent bg-accent text-accent-ink" : "border-accent/60 bg-accent/10") : "border-dashed border-line text-muted"
                }`}
                aria-label={`${WEEKDAYS_LONG[i]}: ${di >= 0 ? plan.days[di]!.name : "odpoczynek"}`}
              >
                <span className="font-mono text-xs font-bold">{w}</span>
                <span className="w-full truncate text-[11px] leading-tight">{di >= 0 ? plan.days[di]!.name : readOnly ? "–" : "+"}</span>
              </button>
            );
          })}
        </div>
      </section>
      )}

      {flexible && <SectionTitle>Kolejność treningów</SectionTitle>}

      {/* Wszystkie treningi planu (także bez stałego dnia, np. A/B na zmianę). */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {plan.days.map((d, i) => (
          <button
            key={i}
            onClick={() => setDayIdx(i)}
            className={`min-h-10 shrink-0 rounded-full border px-4 font-mono text-sm font-semibold ${i === dayIdx ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
          >
            {flexible && <span className="opacity-60">{i + 1}. </span>}
            {d.name}
          </button>
        ))}
        {!readOnly && (
          <button onClick={() => addDay()} className="min-h-10 shrink-0 rounded-full border border-dashed border-line px-4 font-mono text-sm text-muted">
            + trening
          </button>
        )}
      </div>

      {day && (
        <section className="grid gap-3">
          {!readOnly && (
            <Card className="grid gap-3">
              <input
                value={day.name}
                onChange={(e) => updateDay({ name: e.target.value })}
                maxLength={60}
                aria-label="Nazwa treningu"
                className="min-h-12 rounded-xl border border-line bg-bg px-3 text-lg font-semibold outline-none focus:border-accent"
              />
              <DayIconPicker
                value={day.icon ?? null}
                auto={autoDayIcon(day.blocks.map((b) => catalog.data?.find((e) => e.id === b.exercise_id)?.muscle))}
                onChange={(icon) => updateDay({ icon })}
              />
              {flexible && plan.days.length > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => moveDay(-1)} disabled={dayIdx === 0} className="min-h-11 rounded-lg border border-line font-mono text-sm disabled:opacity-30">
                    ← wcześniej
                  </button>
                  <button onClick={() => moveDay(1)} disabled={dayIdx === plan.days.length - 1} className="min-h-11 rounded-lg border border-line font-mono text-sm disabled:opacity-30">
                    później →
                  </button>
                </div>
              )}
              {!flexible && (
              <div className="grid gap-1.5">
                <span className="font-mono text-xs font-semibold text-muted">w które dni</span>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS_SHORT.map((w, i) => (
                    <button
                      key={w}
                      onClick={() => toggleWeekday(i)}
                      className={`min-h-11 rounded-lg border font-mono text-sm font-semibold ${day.weekdays.includes(i) ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              )}
            </Card>
          )}

          {day.blocks.length === 0 && <p className="py-4 text-center text-muted">Brak bloczków. Dodaj pierwsze ćwiczenie.</p>}
          {day.blocks.map((b, i) => (
            <BlockCard
              key={`${dayIdx}-${i}-${b.exercise_id}`}
              block={b}
              exercise={catalog.data?.find((e) => e.id === b.exercise_id)}
              index={i}
              count={day.blocks.length}
              readOnly={readOnly}
              onChange={(nb) => setBlocks(day.blocks.map((x, j) => (j === i ? nb : x)))}
              onMove={(dir) => {
                const blocks = [...day.blocks];
                [blocks[i], blocks[i + dir]] = [blocks[i + dir]!, blocks[i]!];
                setBlocks(blocks);
              }}
              onRemove={() => setBlocks(day.blocks.filter((_, j) => j !== i))}
            />
          ))}

          {!readOnly && (
            <>
              <Button variant="ghost" className="min-h-14 border-dashed" onClick={() => setPicking(true)} disabled={!catalog.data}>
                + Dodaj bloczek
              </Button>
              <button onClick={removeDay} disabled={plan.days.length === 1} className="min-h-11 justify-self-start font-mono text-sm text-danger disabled:opacity-30">
                usuń trening „{day.name}”
              </button>
            </>
          )}
        </section>
      )}

      <ErrorText>{saveError}</ErrorText>

      {!readOnly && (
        <>
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line px-4">
            <span>
              Aktywny plan
              <span className="block text-sm text-muted">Ekran „Dziś” podpowiada trening z tego planu.</span>
            </span>
            <input type="checkbox" className="size-6 accent-[var(--color-accent)]" checked={plan.active} onChange={() => void toggleActive()} />
          </label>
          <button onClick={() => void removePlan()} className="min-h-12 font-mono text-sm text-danger">
            Usuń plan
          </button>
          <div className="safe-bottom fixed inset-x-0 bottom-[62px] z-20 px-3">
            <div className="mx-auto max-w-xl">
              {(dirty || saved) && (
                <Button onClick={() => void save()} disabled={busy || !dirty || !plan.name.trim() || plan.days.some((d) => !d.name.trim())} className="w-full shadow-lg">
                  {busy ? "zapisywanie…" : dirty ? "✓ Zapisz plan" : "✓ Zapisano"}
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {picking && catalog.data && (
        <ExercisePicker
          exercises={catalog.data}
          recent={(recent ?? []).map((r) => r.id)}
          onPick={(e) => {
            setPicking(false);
            setBlocks([...(day?.blocks ?? []), newBlock(e)]);
          }}
          onClose={() => setPicking(false)}
          onCreated={(e) => {
            setPicking(false);
            void catalog.reload();
            setBlocks([...(day?.blocks ?? []), newBlock(e)]);
          }}
        />
      )}
    </Screen>
  );
}
