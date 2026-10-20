import { useEffect, useState } from "react";

import { clock } from "../ui/kit";

/**
 * Przerwa między seriami. Zapisujemy godzinę końca (nie odliczamy w pętli), więc
 * odświeżenie strony ani przejście do innej zakładki jej nie gubi.
 */

const END_KEY = "pixgym_rest_end";
const TOTAL_KEY = "pixgym_rest_total";
const PER_EXERCISE_KEY = "pixgym_rest_per_exercise";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* tryb prywatny: przerwa żyje tylko w pamięci */
  }
}

/** Przerwa ustawiona dla ćwiczenia na tym telefonie albo domyślna z ustawień. */
export function restFor(exerciseId: string, fallback: number): number {
  try {
    const map = JSON.parse(read(PER_EXERCISE_KEY) ?? "{}") as Record<string, number>;
    return map[exerciseId] ?? fallback;
  } catch {
    return fallback;
  }
}

export function setRestFor(exerciseId: string, seconds: number) {
  try {
    const map = JSON.parse(read(PER_EXERCISE_KEY) ?? "{}") as Record<string, number>;
    write(PER_EXERCISE_KEY, JSON.stringify({ ...map, [exerciseId]: seconds }));
  } catch {
    /* pomijamy */
  }
}

async function notifyRestOver() {
  navigator.vibrate?.([300, 150, 300]);
  if (document.visibilityState === "visible") return;
  if ("Notification" in window && Notification.permission === "granted") {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.showNotification("Koniec przerwy", { body: "Czas na następną serię.", tag: "rest" });
  }
}

export interface RestTimer {
  end: number | null;
  total: number;
  now: number;
  start: (seconds: number) => void;
  add: (seconds: number) => void;
  stop: () => void;
}

export function useRestTimer(): RestTimer {
  const [end, setEnd] = useState<number | null>(() => {
    const v = Number(read(END_KEY));
    return v > Date.now() ? v : null;
  });
  const [total, setTotal] = useState(() => Number(read(TOTAL_KEY)) || 120);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!end) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const done = setTimeout(() => {
      void notifyRestOver();
      setEnd(null);
      write(END_KEY, null);
    }, Math.max(0, end - Date.now()));
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [end]);

  const set = (e: number | null) => {
    setEnd(e);
    write(END_KEY, e ? String(e) : null);
    setNow(Date.now());
  };

  return {
    end,
    total,
    now,
    start: (seconds) => {
      if (seconds <= 0) return;
      setTotal(seconds);
      write(TOTAL_KEY, String(seconds));
      set(Date.now() + seconds * 1000);
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    },
    add: (seconds) => {
      if (!end) return;
      const next = end + seconds * 1000;
      if (next <= Date.now()) set(null);
      else {
        setTotal((t) => Math.max(1, t + seconds));
        set(next);
      }
    },
    stop: () => set(null),
  };
}

export function RestBar({ timer }: { timer: RestTimer }) {
  if (!timer.end || timer.end <= timer.now) return null;
  const left = (timer.end - timer.now) / 1000;
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-[62px] z-20 px-3">
      <div className="glow mx-auto max-w-xl overflow-hidden rounded-2xl bg-surface/95 backdrop-blur">
        <div className="h-1 bg-gradient-to-r from-accent/60 to-accent transition-[width] duration-200" style={{ width: `${Math.min(100, (left / timer.total) * 100)}%` }} />
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="grid leading-none">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">przerwa</span>
            <span className="num text-[30px] font-bold text-accent" aria-live="polite">
              {clock(left)}
            </span>
          </span>
          <div className="flex gap-1.5">
            <button className="num min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => timer.add(-15)}>
              −15
            </button>
            <button className="num min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => timer.add(15)}>
              +15
            </button>
            <button className="min-h-11 rounded-lg border border-line px-3 font-mono text-sm" onClick={timer.stop} aria-label="Pomiń przerwę">
              pomiń
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
