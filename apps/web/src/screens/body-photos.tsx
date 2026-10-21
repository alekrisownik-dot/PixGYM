import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Measurement, ProgressPhoto } from "../api";
import { IconChevronLeft, IconChevronRight } from "../ui/icons";
import { bodyPhotoUrl } from "../ui/image";
import { Segmented, kg, shortDate } from "../ui/kit";

/**
 * Zdjęcia sylwetki jednej pozy: porównanie w „wizjerze” (suwak, obok siebie, miganie,
 * timelapse), zmiany pomiarów między datami, taśma filmowa i pełny ekran z przewijaniem.
 */

type Mode = "slider" | "side" | "flash" | "timelapse";
const MODES = [
  ["slider", "Suwak"],
  ["side", "Obok"],
  ["flash", "Miganie"],
  ["timelapse", "Timelapse"],
] as const;

const DAY = 86400_000;
const time = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime();

/** „start”, „+3 dni”, „+4 tyg.”: odległość od pierwszego zdjęcia. */
function sinceStart(iso: string, start: string): string {
  const days = Math.round((time(iso) - time(start)) / DAY);
  if (days <= 0) return "start";
  return days < 14 ? `+${days} dni` : `+${Math.round(days / 7)} tyg.`;
}

/** Ramka jak w wizjerze aparatu: narożniki, linie skanowania i pieczątka z datą. */
function Viewfinder({ children, stamp, accent, className = "" }: { children: ReactNode; stamp?: ReactNode; accent?: boolean; className?: string }) {
  return (
    <div className={`viewfinder relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-line bg-surface-2 ${className}`}>
      {children}
      <span className="vf-corner vf-tl" />
      <span className="vf-corner vf-tr" />
      <span className="vf-corner vf-bl" />
      <span className="vf-corner vf-br" />
      {stamp && (
        <span className={`pointer-events-none absolute bottom-7 left-7 rounded bg-black/70 px-2 py-1 font-mono text-[12px] font-semibold leading-tight ${accent ? "text-accent" : "text-white"}`}>
          {stamp}
        </span>
      )}
    </div>
  );
}

function Stamp({ label, p, start }: { label: string; p: ProgressPhoto; start: string }) {
  return (
    <>
      <span className="block text-[10px] uppercase tracking-widest opacity-80">{label}</span>
      {shortDate(p.taken_at)} · {sinceStart(p.taken_at, start)}
    </>
  );
}

/** Stos zdjęć: widać tylko jedno, ale wszystkie są już wczytane, więc przełączanie nie miga. */
function Stack({ photos, shown }: { photos: ProgressPhoto[]; shown: string }) {
  return (
    <>
      {photos.map((p) => (
        <img
          key={p.id}
          src={bodyPhotoUrl(p.id, "full")}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${p.id === shown ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </>
  );
}

function Slider({ before, after, start }: { before: ProgressPhoto; after: ProgressPhoto; start: string }) {
  const [pos, setPos] = useState(50);
  return (
    <Viewfinder>
      <img src={bodyPhotoUrl(before.id, "full")} alt="przed" className="absolute inset-0 h-full w-full object-cover" />
      <img src={bodyPhotoUrl(after.id, "full")} alt="po" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent shadow-[0_0_14px_rgb(var(--accent-rgb)/.9)]" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 left-1/2 grid h-11 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border-2 border-accent bg-bg font-mono text-[13px] font-bold text-accent">
          ◂▸
        </span>
      </div>
      <span className="pointer-events-none absolute top-7 left-7 rounded bg-black/70 px-2 py-1 font-mono text-[11px] leading-tight text-white">
        <Stamp label="przed" p={before} start={start} />
      </span>
      <span className="pointer-events-none absolute top-7 right-7 rounded bg-black/70 px-2 py-1 text-right font-mono text-[11px] leading-tight text-accent">
        <Stamp label="po" p={after} start={start} />
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Przesuń, żeby porównać"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </Viewfinder>
  );
}

/** Przełącza kolejne zdjęcia co `ms`; dotknięcie zatrzymuje i wznawia. */
function Player({ photos, ms, start, label }: { photos: ProgressPhoto[]; ms: number; start: string; label: (p: ProgressPhoto, i: number) => string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || photos.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % photos.length), ms);
    return () => clearInterval(t);
  }, [paused, photos.length, ms]);
  const p = photos[i % photos.length]!;
  return (
    <button onClick={() => setPaused((v) => !v)} className="block w-full text-left" aria-label={paused ? "Wznów" : "Zatrzymaj"}>
      <Viewfinder stamp={<Stamp label={label(p, i)} p={p} start={start} />} accent={i > 0}>
        <Stack photos={photos} shown={p.id} />
        {paused && <span className="absolute top-3 right-3 rounded bg-black/70 px-2 py-1 font-mono text-[12px] text-white">❚❚ pauza</span>}
      </Viewfinder>
      <div className="mt-2 flex gap-1" aria-hidden>
        {photos.map((x, j) => (
          <span key={x.id} className={`h-1.5 flex-1 rounded-sm ${j <= i % photos.length ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
    </button>
  );
}

const DELTAS: ReadonlyArray<readonly [keyof Measurement, string, string]> = [
  ["weight_kg", "waga", "kg"],
  ["waist_cm", "talia", "cm"],
  ["chest_cm", "klatka", "cm"],
  ["arm_cm", "ramię", "cm"],
  ["thigh_cm", "udo", "cm"],
  ["body_fat_pct", "tłuszcz", "%"],
];

/** Pomiar najbliższy dacie zdjęcia (do 2 tygodni różnicy), osobno dla każdej wielkości. */
function near(items: Measurement[], iso: string, key: keyof Measurement): number | null {
  let best: { v: number; d: number } | null = null;
  for (const m of items) {
    const v = m[key];
    if (typeof v !== "number") continue;
    const d = Math.abs(time(m.measured_at) - time(iso));
    if (d <= 14 * DAY && (!best || d < best.d)) best = { v, d };
  }
  return best?.v ?? null;
}

function Deltas({ before, after, measurements }: { before: ProgressPhoto; after: ProgressPhoto; measurements: Measurement[] }) {
  const rows = DELTAS.flatMap(([key, name, unit]) => {
    const a = near(measurements, before.taken_at, key);
    const b = near(measurements, after.taken_at, key);
    if (a == null || b == null || a === b) return [];
    const d = b - a;
    return [{ name, text: `${d > 0 ? "▲ +" : "▼ −"}${kg(Math.abs(d))} ${unit}`, up: d > 0 }];
  });
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {rows.map((r) => (
        <span key={r.name} className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[13px]">
          <span className="text-muted">{r.name} </span>
          <b className={r.up ? "text-amber" : "text-cyan"}>{r.text}</b>
        </span>
      ))}
    </div>
  );
}

/** Pełny ekran: przewijanie palcem między zdjęciami, wybór przed/po i usuwanie. */
function Viewer({
  photos,
  index,
  start,
  onIndex,
  onClose,
  onPick,
  onDelete,
}: {
  photos: ProgressPhoto[];
  index: number;
  start: string;
  onIndex: (i: number) => void;
  onClose: () => void;
  onPick: (side: "before" | "after", p: ProgressPhoto) => void;
  onDelete: (p: ProgressPhoto) => void;
}) {
  const p = photos[index]!;
  const touch = useRef<number | null>(null);
  const go = (d: number) => onIndex(Math.min(photos.length - 1, Math.max(0, index + d)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => (e.key === "ArrowLeft" ? go(-1) : e.key === "ArrowRight" ? go(1) : e.key === "Escape" && onClose());
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const btn = "min-h-12 rounded-xl border px-3 font-mono text-[14px] font-semibold";
  return (
    <div
      className="fixed inset-0 z-40 grid grid-rows-[auto_1fr_auto] bg-black px-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
      onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0]!.clientX - (touch.current ?? e.changedTouches[0]!.clientX);
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="mx-auto flex w-full max-w-xl items-center justify-between font-mono text-white">
        <span>
          <b className="text-accent">{sinceStart(p.taken_at, start)}</b> · {shortDate(p.taken_at)}
        </span>
        <span className="text-white/60">
          {index + 1}/{photos.length}
        </span>
        <button onClick={onClose} className="grid size-11 place-items-center text-xl" aria-label="Zamknij">
          ✕
        </button>
      </div>
      <div className="relative min-h-0">
        <img src={bodyPhotoUrl(p.id, "full")} alt={`zdjęcie ${shortDate(p.taken_at)}`} className="h-full w-full object-contain" />
        {index > 0 && (
          <button onClick={() => go(-1)} className="absolute top-1/2 left-0 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white" aria-label="Poprzednie">
            <IconChevronLeft size={26} />
          </button>
        )}
        {index < photos.length - 1 && (
          <button onClick={() => go(1)} className="absolute top-1/2 right-0 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white" aria-label="Następne">
            <IconChevronRight size={26} />
          </button>
        )}
      </div>
      <div className="mx-auto grid w-full max-w-xl grid-cols-[1fr_1fr_auto] gap-2 pt-3">
        <button className={`${btn} border-white/30 text-white`} onClick={() => onPick("before", p)}>
          ◂ jako PRZED
        </button>
        <button className={`${btn} border-accent text-accent`} onClick={() => onPick("after", p)}>
          jako PO ▸
        </button>
        <button className={`${btn} border-danger text-danger`} onClick={() => onDelete(p)} aria-label="Usuń zdjęcie">
          🗑
        </button>
      </div>
    </div>
  );
}

export function PhotoLab({ photos, measurements, onDelete }: { photos: ProgressPhoto[]; measurements: Measurement[]; onDelete: (p: ProgressPhoto) => Promise<void> }) {
  // Od najstarszego: tak czyta się postęp.
  const list = useMemo(() => [...photos].sort((a, b) => time(a.taken_at) - time(b.taken_at)), [photos]);
  const [mode, setMode] = useState<Mode>("slider");
  const [pick, setPick] = useState<{ before?: string; after?: string }>({});
  const [viewing, setViewing] = useState<number | null>(null);

  if (list.length === 0) return null;
  const start = list[0]!.taken_at;
  const before = list.find((p) => p.id === pick.before) ?? list[0]!;
  const after = list.find((p) => p.id === pick.after) ?? list[list.length - 1]!;
  const pair = list.length > 1 && before.id !== after.id;
  const days = Math.round(Math.abs(time(after.taken_at) - time(before.taken_at)) / DAY);

  return (
    <div className="grid gap-3">
      {pair ? (
        <>
          <Segmented value={mode} options={MODES} onChange={setMode} full />
          {mode === "slider" && <Slider before={before} after={after} start={start} />}
          {mode === "side" && (
            <div className="grid grid-cols-2 gap-2">
              {[before, after].map((p, i) => (
                <button key={p.id} onClick={() => setViewing(list.indexOf(p))}>
                  <Viewfinder stamp={<Stamp label={i ? "po" : "przed"} p={p} start={start} />} accent={i === 1}>
                    <img src={bodyPhotoUrl(p.id, "full")} alt={i ? "po" : "przed"} className="absolute inset-0 h-full w-full object-cover" />
                  </Viewfinder>
                </button>
              ))}
            </div>
          )}
          {mode === "flash" && <Player photos={[before, after]} ms={800} start={start} label={(_, i) => (i ? "po" : "przed")} />}
          {mode === "timelapse" && <Player photos={list} ms={700} start={start} label={(_, i) => `klatka ${i + 1}/${list.length}`} />}
          <p className="text-center font-mono text-[13px] text-muted">
            {days >= 14 ? `${Math.round(days / 7)} tyg.` : `${days} dni`} między zdjęciami
            {mode === "slider" ? " · przesuń palcem" : mode === "side" ? "" : " · dotknij, żeby zatrzymać"}
          </p>
          <Deltas before={before} after={after} measurements={measurements} />
        </>
      ) : (
        <button onClick={() => setViewing(0)} className="block text-left">
          <Viewfinder stamp={<Stamp label="start" p={list[0]!} start={start} />}>
            <img src={bodyPhotoUrl(list[0]!.id, "full")} alt="pierwsze zdjęcie" className="absolute inset-0 h-full w-full object-cover" />
          </Viewfinder>
        </button>
      )}

      {/* Taśma filmowa: dotknij klatki, żeby ją obejrzeć albo ustawić jako przed/po. */}
      <div className="film -mx-1 flex gap-1.5 overflow-x-auto px-3 py-4">
        {list.map((p, i) => {
          const tag = pair && p.id === before.id ? "przed" : pair && p.id === after.id ? "po" : null;
          return (
            <button key={p.id} onClick={() => setViewing(i)} className="relative shrink-0 text-center">
              <img
                src={bodyPhotoUrl(p.id)}
                alt={`zdjęcie ${shortDate(p.taken_at)}`}
                loading="lazy"
                className={`h-28 w-21 rounded-sm object-cover ${tag ? "ring-2 ring-offset-2 ring-offset-black " + (tag === "po" ? "ring-accent" : "ring-white/80") : "opacity-75"}`}
              />
              {tag && (
                <span className={`absolute top-1 left-1 rounded-sm px-1 font-mono text-[9.5px] font-bold uppercase ${tag === "po" ? "bg-accent text-accent-ink" : "bg-white text-black"}`}>{tag}</span>
              )}
              <span className="mt-1 block font-mono text-[11px] font-semibold text-white">{sinceStart(p.taken_at, start)}</span>
              <span className="block font-mono text-[10px] text-white/60">{shortDate(p.taken_at)}</span>
            </button>
          );
        })}
      </div>

      {viewing != null && list[viewing] && (
        <Viewer
          photos={list}
          index={viewing}
          start={start}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onPick={(side, p) => {
            setPick({ ...pick, [side]: p.id });
            setViewing(null);
          }}
          onDelete={(p) => {
            if (!confirm("Usunąć to zdjęcie? Plik zniknie od razu.")) return;
            setViewing(null);
            void onDelete(p);
          }}
        />
      )}
    </div>
  );
}
