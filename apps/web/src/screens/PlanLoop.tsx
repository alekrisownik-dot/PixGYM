import { useEffect, useRef, useState, type CSSProperties } from "react";

import { errorText, type Exercise, type Plan, type PlanDay, type PlanProgress } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { assignDay, cachedGet, completeDay, deleteSession, loadSession } from "../offline/sessions";
import { ExerciseArt } from "../ui/exercise-art";
import { PixelIcon } from "../ui/pixel-icons";
import { IconCheck, IconPlay } from "../ui/icons";
import { Button, ErrorText } from "../ui/kit";
import { Bit } from "../ui/mascot";
import { quipOfDay } from "../ui/quips";
import { getTheme } from "../ui/theme";
import { autoDayIcon, dayIconInfo, muscleGroup } from "../ui/muscles";
import { Sheet } from "../ui/sheet";
import { toast } from "../ui/toast";
import { WEEKDAYS_SHORT, blockText, weekdayOf } from "./plan-format";

/**
 * Plan elastyczny jako koło: treningi na okręgu, „teraz” zawsze na górze. Zaliczony dzień
 * (treningiem albo przyciskiem „Zalicz”) dostaje pieczątkę w środku koła, a potem koło
 * obraca się do następnego niezaliczonego. Od poniedziałku wszystko wraca do gry.
 */

const SEEN_PREFIX = "pixgym_loop_seen:";
const STAMP_MS = 900;

function readSeen(key: string): number[] | null {
  try {
    const v = localStorage.getItem(SEEN_PREFIX + key);
    return v ? (JSON.parse(v) as number[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(key: string, days: number[]) {
  try {
    localStorage.setItem(SEEN_PREFIX + key, JSON.stringify(days));
  } catch {
    /* tryb prywatny: animacja może się powtórzyć */
  }
}

// Piksele rozlatujące się spod pieczątki (kierunki w px).
const BURST = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const r = 46 + (i % 3) * 14;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), c: i % 4 === 0 ? "var(--color-amber)" : "var(--color-accent)" };
});

export function PlanLoop({
  plan,
  progress,
  weekKey,
  busy,
  onStart,
}: {
  plan: Plan;
  progress: PlanProgress | null;
  /** Poniedziałek tygodnia (YYYY-MM-DD): „widziane” zaliczenia pamiętamy per tydzień. */
  weekKey: string;
  busy: boolean;
  onStart: (d: PlanDay) => void;
}) {
  const n = plan.days.length;
  const { data: catalog } = useLoad(() => cachedGet<Exercise[]>("/exercises"), []);
  const byId = new Map((catalog ?? []).map((e) => [e.id, e]));
  const storeKey = `${plan.id}:${weekKey}`;

  // Zaliczone według serwera (i treningów czekających na wysłanie), w kolejności zaliczenia.
  const [undone, setUndone] = useState<Set<number>>(new Set());
  const serverDone = [...new Set((progress?.done ?? []).map((d) => d.day_index))].filter((i) => !undone.has(i));
  const when = new Map((progress?.done ?? []).map((d) => [d.day_index, weekdayOf(new Date(`${d.local_date}T12:00:00`))]));

  // Pokazane już jako zaliczone. Nowe zaliczenia (np. po powrocie z treningu) dostają animację.
  const [shown, setShown] = useState<number[]>(() => {
    const seen = readSeen(storeKey);
    return seen ? serverDone.filter((i) => seen.includes(i)) : serverDone;
  });
  // Zaliczone przyciskiem na tym ekranie: dzień planu → dzień tygodnia i ID treningu.
  const [local, setLocal] = useState<Map<number, { wd: number; id: string }>>(new Map());
  const [undoing, setUndoing] = useState<number | null>(null);
  const [stamping, setStamping] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const doneAll = [...serverDone, ...[...local.keys()].filter((i) => !serverDone.includes(i))];
  const fresh = doneAll.filter((i) => !shown.includes(i));

  // Ostatni zaliczony wyznacza, od którego dnia idzie kolejka.
  const lastIdx = local.size ? [...local.keys()].at(-1)! : (progress?.last_day_index ?? null);
  const baseAnchor = lastIdx != null ? (lastIdx + 1) % n : 0;
  // Podczas pieczątki zaliczany dzień zostaje na górze; wybrany ręcznie też idzie na górę.
  const anchor = stamping ?? picked ?? (fresh.length ? fresh[0]! : baseAnchor);

  // Nowe zaliczenie: pieczątka na karcie, potem karta zjeżdża na koniec.
  useEffect(() => {
    if (stamping != null || !fresh.length) return;
    const day = fresh[0]!;
    setStamping(day);
    navigator.vibrate?.(40);
    timer.current = window.setTimeout(() => {
      setShown((s) => {
        const next = [...s, day];
        writeSeen(storeKey, next);
        return next;
      });
      setStamping(null);
      setPicked(null);
    }, STAMP_MS);
  }, [fresh.join(","), stamping, storeKey]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Pierwsze wejście w tym tygodniu: zapamiętujemy stan, żeby nie animować starych zaliczeń.
  useEffect(() => {
    if (readSeen(storeKey) === null) writeSeen(storeKey, shown);
  }, [storeKey, shown]);

  async function markDone(i: number) {
    setError(null);
    try {
      const s = await completeDay(plan.days[i]!);
      setUndone((u) => {
        const next = new Set(u);
        next.delete(i);
        return next;
      });
      setLocal((m) => new Map(m).set(i, { wd: weekdayOf(new Date()), id: s.id }));
      const count = doneAll.length + 1;
      if (count >= n)
        toast({
          tone: "record",
          title: "Tydzień zaliczony!",
          body: getTheme() === "red" ? quipOfDay(count) : `Wszystkie ${n} treningi z planu. Pętla rusza od poniedziałku.`,
        });
      else toast({ tone: "info", title: `Zaliczone: ${plan.days[i]!.name}`, body: `${count}/${n} w tym tygodniu` });
    } catch (e) {
      setError(errorText(e));
    }
  }

  /** Cofnięcie: puste zaliczenie znika, zapisany trening zostaje w historii, tylko bez dnia planu. */
  async function undo(i: number) {
    setError(null);
    setUndoing(null);
    const ids = [...(progress?.done ?? []).filter((d) => d.day_index === i).map((d) => d.session_id), ...(local.get(i) ? [local.get(i)!.id] : [])];
    try {
      for (const id of new Set(ids)) {
        const s = await loadSession(id).catch(() => null);
        if (!s) continue;
        if (s.exercises.every((e) => e.sets.length === 0)) await deleteSession(s);
        else await assignDay(s, null);
      }
      setUndone((u) => new Set(u).add(i));
      setLocal((m) => {
        const next = new Map(m);
        next.delete(i);
        return next;
      });
      setShown((s) => {
        const next = s.filter((x) => x !== i);
        writeSeen(storeKey, next);
        return next;
      });
      setPicked(i);
      toast({ tone: "info", title: `Cofnięto: ${plan.days[i]!.name}`, body: "Dzień wrócił do koła." });
    } catch (e) {
      setError(errorText(e));
    }
  }

  const todoCount = n - shown.length;
  const weekDone = n > 0 && doneAll.length >= n && stamping == null && !fresh.length;
  const current = plan.days[anchor];
  const currentDone = shown.includes(anchor);

  // Koło obraca się zawsze do przodu: liczymy obroty narastająco (kąt nie „cofa się” przez 0).
  const step = 360 / Math.max(1, n);
  const [turns, setTurns] = useState(anchor);
  const prevAnchor = useRef(anchor);
  useEffect(() => {
    const delta = (anchor - prevAnchor.current + n) % n;
    prevAnchor.current = anchor;
    if (delta) setTurns((t) => t + delta);
  }, [anchor, n]);

  const R = 118;
  const node = n <= 4 ? 84 : n <= 6 ? 70 : 56;
  const ringC = 2 * Math.PI * 54;
  // Przerwa w torze przy każdym węźle (stopnie), żeby łuki nie wchodziły pod kółka.
  const gapDeg = ((node / 2 + 7) / R) * (180 / Math.PI);
  const point = (deg: number) => [R * Math.sin((deg * Math.PI) / 180), -R * Math.cos((deg * Math.PI) / 180)] as const;
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  // Ikonka dnia: wybrana w edytorze albo partia, która ma w nim najwięcej ćwiczeń.
  const iconOf = (d: PlanDay) => d.icon ?? autoDayIcon(d.blocks.map((b) => byId.get(b.exercise_id)?.muscle));
  const groupsOf = (d: PlanDay) =>
    [...new Map(d.blocks.map((b) => muscleGroup(byId.get(b.exercise_id)?.muscle)).filter((g) => g != null).map((g) => [g!.name, g!])).values()];
  const ease = "duration-[900ms] ease-[cubic-bezier(.3,1.25,.4,1)]";

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="min-w-0 truncate font-mono text-[12px] font-semibold uppercase tracking-wider text-muted">
          pętla · {plan.name}
        </span>
        <a href={href({ name: "plan", id: plan.id })} className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted">
          edytuj
        </a>
      </div>

      {/* Koło treningów: „teraz” zawsze na górze; po zaliczeniu całość obraca się do następnego. */}
      <div className="relative mx-auto aspect-square w-full max-w-[350px] overflow-hidden" aria-label={`Zaliczone ${shown.length} z ${n} w tym tygodniu`}>
        {/* Środek: postęp tygodnia (pierścień), Bit i licznik; przy zaliczeniu pieczątka. */}
        <svg viewBox="-175 -175 350 350" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle r="54" fill="var(--color-surface)" stroke="var(--color-surface-2)" strokeWidth="9" />
          <circle
            r="54"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={ringC}
            strokeDashoffset={ringC * (1 - shown.length / Math.max(1, n))}
            transform="rotate(-90)"
            className="transition-[stroke-dashoffset] duration-700 ease-out"
            style={{ filter: "drop-shadow(0 0 6px rgb(var(--accent-rgb) / .5))" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          {stamping != null ? (
            <div className="relative grid place-items-center">
              {BURST.map((p, k) => (
                <span key={k} className="loop-pixel absolute size-2.5" style={{ "--dx": `${p.dx * 1.6}px`, "--dy": `${p.dy * 1.6}px`, background: p.c } as CSSProperties} />
              ))}
              <span className="loop-check grid size-[92px] place-items-center rounded-full bg-accent text-accent-ink shadow-[0_0_40px_rgb(var(--accent-rgb)/.6)]">
                <IconCheck size={48} strokeWidth={3.5} />
              </span>
            </div>
          ) : (
            <div className="grid justify-items-center leading-none">
              <Bit mood={weekDone ? "flex" : "idle"} size={weekDone ? 60 : 44} />
              {!weekDone && (
                <span className="num mt-1 text-[22px] font-bold">
                  {shown.length}
                  <span className="text-muted">/{n}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className={`absolute inset-0 transition-transform ${ease}`} style={{ transform: `rotate(${-turns * step}deg)` }}>
          {/* Tor: łuk za każdym dniem; zapala się, gdy dzień zaliczony. */}
          {n > 1 && (
            <svg viewBox="-175 -175 350 350" className="absolute inset-0 h-full w-full" aria-hidden>
              {plan.days.map((_, i) => {
                const done = shown.includes(i);
                return (
                  <path
                    key={i}
                    d={arc(i * step + gapDeg, (i + 1) * step - gapDeg)}
                    fill="none"
                    stroke={done ? "var(--color-accent)" : "var(--color-line)"}
                    strokeWidth={done ? 5 : 3}
                    strokeLinecap="round"
                    strokeDasharray={done ? undefined : "2 7"}
                    className="transition-[stroke] duration-500"
                    style={done ? { filter: "drop-shadow(0 0 5px rgb(var(--accent-rgb) / .6))" } : undefined}
                  />
                );
              })}
            </svg>
          )}
          {plan.days.map((d, i) => {
            const isDone = shown.includes(i);
            const isTop = i === anchor && !weekDone;
            const doneOn = when.get(i) ?? local.get(i)?.wd;
            const icon = iconOf(d);
            const color = icon ? dayIconInfo(icon).color : "var(--color-line)";
            return (
              <button
                key={i}
                onClick={() => (isDone ? setUndoing(i) : setPicked(i === baseAnchor ? null : i))}
                disabled={stamping != null}
                className="absolute top-1/2 left-1/2"
                style={{ width: node, height: node, margin: -node / 2, transform: `rotate(${i * step}deg) translateY(${-R}px)` }}
                aria-label={`${d.name}${isDone ? ", zaliczone (dotknij, żeby cofnąć)" : ""}`}
              >
                {/* Zawartość zawsze prosto: przeciwny obrót, z tym samym czasem przejścia co koło. */}
                <span className={`block h-full w-full transition-transform ${ease}`} style={{ transform: `rotate(${-(i * step) + turns * step}deg)` }}>
                  <span
                    className={`relative grid h-full w-full place-items-center content-center gap-0.5 rounded-full border-[3px] p-1 text-center transition duration-500 ${
                      isDone ? "border-accent bg-accent text-accent-ink" : isTop ? `${stamping === i ? "loop-stamped" : "loop-now"} scale-110 bg-surface text-fg` : "bg-surface text-muted"
                    }`}
                    style={isDone ? undefined : { borderColor: isTop ? "var(--color-accent)" : color }}
                  >
                    {icon ? (
                      <PixelIcon name={`m_${icon}`} size={node * 0.58} accent={isDone ? "currentColor" : color} className={isDone ? "opacity-80" : "text-fg"} />
                    ) : (
                      <PixelIcon name="dumbbell" size={node * 0.5} />
                    )}
                    {isDone && (
                      <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-bg text-accent ring-2 ring-accent">
                        <IconCheck size={14} strokeWidth={4} />
                      </span>
                    )}
                    {isTop && <span className="absolute -top-3 rounded-full bg-accent px-2 py-0.5 font-mono text-[9.5px] font-bold text-accent-ink shadow">TERAZ</span>}
                    {isDone && doneOn != null && <span className="absolute -bottom-2.5 rounded-full bg-bg px-1.5 font-mono text-[10px] font-semibold text-accent ring-1 ring-accent/60">{WEEKDAYS_SHORT[doneOn]!.toLowerCase()}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {weekDone ? (
        <div className="card pop p-4 text-center">
          <p className="text-[17px]">
            <b className="text-accent">Tydzień zaliczony!</b> Od poniedziałku koło rusza od nowa.
          </p>
        </div>
      ) : (
        current && (
          <div className="card glow grid gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              {iconOf(current) && (
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 bg-surface-2" style={{ borderColor: dayIconInfo(iconOf(current)!).color }}>
                  <PixelIcon name={`m_${iconOf(current)!}`} size={36} accent={dayIconInfo(iconOf(current)!).color} className="text-fg" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">
                  {stamping != null ? "zaliczone!" : picked != null ? "wybrany" : "teraz"}
                  {stamping == null && !currentDone && ` · ${todoCount > 1 ? `potem jeszcze ${todoCount - 1}` : "ostatni w tym tygodniu"}`}
                </p>
                <p className="truncate font-mono text-[26px] leading-tight font-bold">{current.name}</p>
              </div>
              <span className="num shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-muted">{current.blocks.length} ćw.</span>
            </div>
            {groupsOf(current).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {groupsOf(current).map((g) => (
                  <span key={g.name} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-semibold" style={{ borderColor: g.color, color: g.color }}>
                    <span className="size-2 rounded-full" style={{ background: g.color }} />
                    {g.name}
                  </span>
                ))}
              </div>
            )}
            {current.blocks.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5">
                  <span className="flex flex-wrap gap-1.5">
                    {current.blocks.map((b, j) => (
                      <ExerciseArt key={j} exercise={byId.get(b.exercise_id) ?? b} size={44} />
                    ))}
                  </span>
                </summary>
                <ul className="mt-2 grid gap-1 border-t border-line/60 pt-2">
                  {current.blocks.map((b, j) => (
                    <li key={j} className="flex items-baseline justify-between gap-3 text-[15px]">
                      <span className="min-w-0 truncate">{b.name}</span>
                      <span className="num shrink-0 text-[13px] text-muted">{blockText(b)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-center font-mono text-[11px] text-muted group-open:hidden">dotknij obrazków, żeby zobaczyć listę</p>
              </details>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button className="min-h-14 text-lg" onClick={() => onStart(current)} disabled={busy || stamping != null}>
                <IconPlay size={18} /> Zacznij
              </Button>
              <Button
                variant="outline"
                className="min-h-14 px-5"
                onClick={() => void markDone(anchor)}
                disabled={busy || stamping != null || currentDone}
                aria-label={`Zalicz ${current.name} bez zapisywania serii`}
              >
                <IconCheck size={20} strokeWidth={3} /> Zalicz
              </Button>
            </div>
          </div>
        )
      )}
      <ErrorText>{error}</ErrorText>
      {undoing != null && (
        <Sheet title={`Cofnąć zaliczenie: ${plan.days[undoing]!.name}?`} onClose={() => setUndoing(null)}>
          <div className="grid gap-3">
            <p className="text-[15px] text-muted">Dzień wróci do koła. Puste zaliczenie zniknie, a zapisany trening zostanie w historii, tylko bez przypięcia do planu.</p>
            <Button onClick={() => void undo(undoing)}>Cofnij zaliczenie</Button>
            <Button variant="ghost" onClick={() => setUndoing(null)}>
              Zostaw
            </Button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
