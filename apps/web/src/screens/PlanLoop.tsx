import { useEffect, useRef, useState, type CSSProperties } from "react";

import { errorText, type Exercise, type Plan, type PlanDay, type PlanProgress } from "../api";
import { href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet, completeDay } from "../offline/sessions";
import { ExerciseArt } from "../ui/exercise-art";
import { IconCheck, IconPlay } from "../ui/icons";
import { Button, ErrorText } from "../ui/kit";
import { Bit } from "../ui/mascot";
import { quipOfDay } from "../ui/quips";
import { getTheme } from "../ui/theme";
import { toast } from "../ui/toast";
import { WEEKDAYS_SHORT, weekdayOf } from "./plan-format";

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
  const serverDone = [...new Set((progress?.done ?? []).map((d) => d.day_index))];
  const when = new Map((progress?.done ?? []).map((d) => [d.day_index, weekdayOf(new Date(`${d.local_date}T12:00:00`))]));

  // Pokazane już jako zaliczone. Nowe zaliczenia (np. po powrocie z treningu) dostają animację.
  const [shown, setShown] = useState<number[]>(() => {
    const seen = readSeen(storeKey);
    return seen ? serverDone.filter((i) => seen.includes(i)) : serverDone;
  });
  const [local, setLocal] = useState<Map<number, number>>(new Map());
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
      await completeDay(plan.days[i]!);
      setLocal((m) => new Map(m).set(i, weekdayOf(new Date())));
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

  const R = 116;
  const node = n <= 4 ? 78 : n <= 6 ? 66 : 54;
  const ringC = 2 * Math.PI * 54;

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
      <div className="relative mx-auto aspect-square w-full max-w-[340px]" aria-label={`Zaliczone ${shown.length} z ${n} w tym tygodniu`}>
        <svg viewBox="-170 -170 340 340" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle r={R} fill="none" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="3 7" />
          <circle r="54" fill="none" stroke="var(--color-surface-2)" strokeWidth="10" />
          <circle
            r="54"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={ringC}
            strokeDashoffset={ringC * (1 - shown.length / Math.max(1, n))}
            transform="rotate(-90)"
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
          {/* Wskaźnik „teraz” nad kołem. */}
          <path d={`M -9 ${-R - node / 2 - 16} L 9 ${-R - node / 2 - 16} L 0 ${-R - node / 2 - 5} Z`} fill="var(--color-accent)" />
        </svg>

        {/* Środek: postęp tygodnia albo pieczątka przy zaliczeniu. */}
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
          ) : weekDone ? (
            <div className="pop grid justify-items-center">
              <Bit mood="flex" size={70} />
            </div>
          ) : (
            <div className="grid justify-items-center leading-none">
              <span className="num text-[34px] font-bold">
                {shown.length}
                <span className="text-muted">/{n}</span>
              </span>
              <span className="mt-1 font-mono text-[11px] text-muted">ten tydzień</span>
            </div>
          )}
        </div>

        <div className="absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(.3,1.25,.4,1)]" style={{ transform: `rotate(${-turns * step}deg)` }}>
          {plan.days.map((d, i) => {
            const isDone = shown.includes(i);
            const isTop = i === anchor;
            const doneOn = when.get(i) ?? local.get(i);
            return (
              <button
                key={i}
                onClick={() => !isDone && setPicked(i === baseAnchor ? null : i)}
                disabled={isDone || stamping != null}
                className="absolute top-1/2 left-1/2"
                style={{ width: node, height: node, margin: -node / 2, transform: `rotate(${i * step}deg) translateY(${-R}px)` }}
                aria-label={`${d.name}${isDone ? ", zaliczone" : ""}`}
              >
                {/* Napis zawsze prosto: przeciwny obrót, z tym samym czasem przejścia co koło. */}
                <span
                  className="block h-full w-full transition-transform duration-[900ms] ease-[cubic-bezier(.3,1.25,.4,1)]"
                  style={{ transform: `rotate(${-(i * step) + turns * step}deg)` }}
                >
                  <span
                    className={`relative grid h-full w-full place-items-center rounded-full border-2 p-1 text-center transition duration-500 ${
                      isDone
                        ? "border-accent bg-accent text-accent-ink"
                        : isTop
                          ? `scale-110 border-accent bg-surface text-fg shadow-[0_0_28px_-4px_rgb(var(--accent-rgb)/.7)] ${stamping === i ? "loop-stamped" : ""}`
                          : "border-line bg-surface text-muted"
                    }`}
                  >
                    <span className={`line-clamp-2 font-mono font-bold leading-tight ${node < 60 ? "text-[10px]" : "text-[12.5px]"}`}>{d.name}</span>
                    {isDone && (
                      <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-bg text-accent ring-2 ring-accent">
                        <IconCheck size={14} strokeWidth={3.5} />
                      </span>
                    )}
                    {isDone && doneOn != null && <span className="absolute -bottom-2 rounded-full bg-bg px-1.5 font-mono text-[10px] text-accent">{WEEKDAYS_SHORT[doneOn]!.toLowerCase()}</span>}
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
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">
                {stamping != null ? "zaliczone!" : picked != null ? "wybrany" : "teraz"}
                {stamping == null && !currentDone && ` · ${todoCount > 1 ? `potem jeszcze ${todoCount - 1}` : "ostatni w tym tygodniu"}`}
              </p>
              <p className="font-mono text-[26px] leading-tight font-bold">{current.name}</p>
            </div>
            {current.blocks.length > 0 && (
              <ul className="grid gap-1.5">
                {current.blocks.map((b, j) => (
                  <li key={j} className="flex items-center gap-2.5 text-[15px]">
                    <ExerciseArt exercise={byId.get(b.exercise_id) ?? b} size={40} />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  </li>
                ))}
              </ul>
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
            {n > 1 && stamping == null && <p className="text-center text-[13px] text-muted">Dotknij innego treningu na kole, żeby zrobić go teraz.</p>}
          </div>
        )
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
