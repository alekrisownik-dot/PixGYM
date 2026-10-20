import { useEffect, useMemo, useRef, useState } from "react";

import { api, errorText, type Exercise, type ExercisePhoto, type Tracking } from "../api";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { Button, ErrorText, Field, Segmented } from "../ui/kit";
import { photoUrl, shrinkImage } from "../ui/image";
import { LoadModePicker } from "./ExerciseInfo";
import { muscleGroup } from "../ui/muscles";
import { ExerciseArt } from "../ui/exercise-art";

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Pełnoekranowa lista ćwiczeń z wyszukiwarką. Ostatnio robione na górze, własne zaraz po nich. */
export function ExercisePicker({
  exercises,
  recent,
  onPick,
  onClose,
  onCreated,
}: {
  exercises: Exercise[];
  recent: string[];
  onPick: (e: Exercise) => void;
  onClose: () => void;
  onCreated: (e: Exercise) => void;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const list = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const match = exercises.filter((e) => {
      const hay = fold(`${e.name} ${e.equipment}`);
      return words.every((w) => hay.includes(w));
    });
    const rank = new Map(recent.map((id, i) => [id, i]));
    const score = (e: Exercise) => rank.get(e.id) ?? (e.custom ? 1e6 : 1e9);
    return words.length ? match : [...match].sort((a, b) => score(a) - score(b));
  }, [q, exercises, recent]);

  if (creating) return <CreateExercise initialName={q} onCancel={() => setCreating(false)} onCreated={onCreated} />;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 border-b border-line px-4 py-3">
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Szukaj: wyciskanie, przysiad…"
          className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 text-lg outline-none focus:border-accent"
          enterKeyHint="search"
        />
        <button onClick={onClose} className="min-h-12 px-3 font-mono text-muted" aria-label="Zamknij">
          ✕
        </button>
      </div>
      <ul className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 pb-10">
        <li>
          <button onClick={() => setCreating(true)} className="my-2 min-h-14 w-full rounded-xl border border-dashed border-accent font-mono font-semibold text-accent">
            + Własne ćwiczenie{q ? `: „${q}”` : ""}
          </button>
        </li>
        {list.map((e) => (
          <li key={e.id}>
            <button onClick={() => onPick(e)} className="flex min-h-14 w-full items-center gap-3 border-b border-line py-2 text-left active:bg-surface">
              {e.photos[0] ? (
                <img src={photoUrl(e.photos[0].id)} alt="" className="h-[39px] w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <ExerciseArt exercise={e} size={56} />
              )}
              <span className="min-w-0 flex-1 text-lg">
                {muscleGroup(e.muscle) && <span className="mr-2 inline-block size-2.5 -translate-y-0.5 rounded-full" style={{ background: muscleGroup(e.muscle)!.color }} />}
                {e.name}
                {e.custom && <span className="ml-2 align-middle font-mono text-xs text-accent">własne</span>}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted">{e.equipment}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-8 text-center text-muted">Nic nie znaleziono. Dodaj je jako własne.</li>}
      </ul>
    </div>
  );
}

const TRACKING: ReadonlyArray<readonly [Tracking, string]> = [
  ["weight_reps", "kg × powt."],
  ["bodyweight_reps", "masa ciała"],
  ["duration", "na czas"],
  ["distance", "dystans"],
];

interface Meta {
  equipment: { slug: string; name: string }[];
  muscles: { slug: string; name: string }[];
}

function CreateExercise({ initialName, onCancel, onCreated }: { initialName: string; onCancel: () => void; onCreated: (e: Exercise) => void }) {
  const { data: meta, error: metaError } = useLoad(() => cachedGet<Meta>("/catalog/meta"), []);
  const [name, setName] = useState(initialName ? initialName[0]!.toUpperCase() + initialName.slice(1) : "");
  const [equipment, setEquipment] = useState("machine");
  const [tracking, setTracking] = useState<Tracking>("weight_reps");
  const [primary, setPrimary] = useState("chest");
  const [secondary, setSecondary] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [perSide, setPerSide] = useState(false);
  const [caption, setCaption] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const ex = await api.post<Exercise>("/exercises", {
        name,
        equipment,
        tracking,
        primary_muscle: primary,
        secondary_muscles: secondary,
        notes: notes.trim() || null,
        per_side: tracking === "weight_reps" && perSide,
      });
      if (photo) {
        try {
          const q = caption.trim() ? `?caption=${encodeURIComponent(caption.trim())}` : "";
          const p = await api.upload<ExercisePhoto>(`/exercises/${ex.id}/photos${q}`, await shrinkImage(photo));
          ex.photos = [p];
        } catch (e) {
          alert(`Ćwiczenie zapisane, ale zdjęcie nie: ${errorText(e)}`);
        }
      }
      onCreated(ex);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const select = "min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-lg text-fg outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-bg">
      <div className="mx-auto grid max-w-xl gap-4 px-4 py-5 pb-16">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-2xl font-bold">Własne ćwiczenie</h2>
          <button onClick={onCancel} className="min-h-12 px-3 font-mono text-muted" aria-label="Wróć">
            ✕
          </button>
        </div>
        <ErrorText>{metaError}</ErrorText>
        <Field label="Nazwa" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="np. Wyciskanie na maszynie Hammer" />

        <div className="grid gap-1.5">
          <span className="font-mono text-sm font-semibold text-muted">Zdjęcie maszyny (opcjonalnie)</span>
          <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          {preview ? (
            <button onClick={() => file.current?.click()} className="overflow-hidden rounded-xl border border-line">
              <img src={preview} alt="podgląd" className="max-h-64 w-full object-cover" />
            </button>
          ) : (
            <button onClick={() => file.current?.click()} className="min-h-24 rounded-xl border border-dashed border-line font-mono text-muted">
              📷 Zrób zdjęcie
            </button>
          )}
          {photo && <Field label="Podpis zdjęcia" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={80} placeholder="np. Zdrofit Mokotów" />}
        </div>

        <div className="grid gap-1.5">
          <span className="font-mono text-sm font-semibold text-muted">Co zapisujesz</span>
          <Segmented value={tracking} options={TRACKING} onChange={setTracking} />
        </div>

        {tracking === "weight_reps" && <LoadModePicker perSide={perSide} onChange={setPerSide} />}

        {meta && (
          <>
            <label className="grid gap-1.5">
              <span className="font-mono text-sm font-semibold text-muted">Sprzęt</span>
              <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={select}>
                {meta.equipment.map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="font-mono text-sm font-semibold text-muted">Główna partia</span>
              <select value={primary} onChange={(e) => setPrimary(e.target.value)} className={select}>
                {meta.muscles.map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1.5">
              <span className="font-mono text-sm font-semibold text-muted">Pomocnicze (liczą się za pół serii)</span>
              <div className="flex flex-wrap gap-1.5">
                {meta.muscles
                  .filter((m) => m.slug !== primary)
                  .map((m) => {
                    const on = secondary.includes(m.slug);
                    return (
                      <button
                        key={m.slug}
                        onClick={() => setSecondary(on ? secondary.filter((x) => x !== m.slug) : [...secondary, m.slug].slice(0, 6))}
                        className={`min-h-10 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
                      >
                        {m.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          </>
        )}

        <label className="grid gap-1.5">
          <span className="font-mono text-sm font-semibold text-muted">Notatka (opcjonalnie)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="np. siedzisko 4, oparcie 2" className="rounded-xl border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent" />
        </label>

        <ErrorText>{error}</ErrorText>
        <Button onClick={() => void save()} disabled={busy || name.trim().length < 2 || !meta}>
          {busy ? "zapisywanie…" : "✓ Zapisz i dodaj do treningu"}
        </Button>
        <p className="text-sm text-muted">Dodanie ćwiczenia wymaga połączenia z serwerem. Trening potem działa też offline.</p>
      </div>
    </div>
  );
}
