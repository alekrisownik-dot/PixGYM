import { useRef, useState } from "react";

import { api, errorText, type Exercise, type ExercisePhoto } from "../api";
import { ErrorText } from "../ui/kit";
import { photoUrl, shrinkImage } from "../ui/image";

/** Zdjęcia maszyny (np. z różnych siłowni) i notatka do własnego ćwiczenia. */
export function ExerciseInfo({ exercise, onChange }: { exercise: Exercise; onChange: () => void }) {
  const [photos, setPhotos] = useState<ExercisePhoto[]>(exercise.photos);
  const [notes, setNotes] = useState(exercise.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [big, setBig] = useState<ExercisePhoto | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    setBusy(true);
    setError(null);
    try {
      const caption = prompt("Podpis, np. nazwa siłowni (opcjonalnie):", "")?.trim() ?? "";
      const blob = await shrinkImage(f);
      const q = caption ? `?caption=${encodeURIComponent(caption)}` : "";
      const p = await api.upload<ExercisePhoto>(`/exercises/${exercise.id}/photos${q}`, blob);
      setPhotos([...photos, p]);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  async function remove(p: ExercisePhoto) {
    if (!confirm("Usunąć zdjęcie?")) return;
    try {
      await api.del(`/exercise-photos/${p.id}`);
      setPhotos(photos.filter((x) => x.id !== p.id));
      setBig(null);
      onChange();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function saveNotes() {
    if (notes === (exercise.notes ?? "")) return;
    try {
      await api.patch(`/exercises/${exercise.id}`, { notes: notes.trim() || null });
      onChange();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="grid gap-3 rounded-xl bg-surface-2 p-3">
      <p className="text-sm text-muted">Zdjęcia maszyny, żeby wiedzieć, o którą chodzi (na każdej siłowni jest inna). Widzisz je tylko Ty.</p>
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setBig(p)} className="shrink-0 text-left">
              <img src={photoUrl(p.id)} alt={p.caption ?? "zdjęcie maszyny"} className="size-24 rounded-lg border border-line object-cover" loading="lazy" />
              {p.caption && <span className="mt-0.5 block max-w-24 truncate font-mono text-xs text-muted">{p.caption}</span>}
            </button>
          ))}
        </div>
      )}
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      <button onClick={() => file.current?.click()} disabled={busy} className="min-h-12 rounded-xl border border-dashed border-line font-mono text-sm disabled:opacity-50">
        {busy ? "wysyłanie…" : "📷 Zrób / dodaj zdjęcie"}
      </button>

      {exercise.custom && (
        <label className="grid gap-1.5">
          <span className="font-mono text-sm font-semibold text-muted">Notatka (np. ustawienie siedziska)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void saveNotes()}
            maxLength={1000}
            rows={2}
            className="rounded-xl border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent"
          />
        </label>
      )}
      <ErrorText>{error}</ErrorText>

      {big && (
        <div className="fixed inset-0 z-40 grid grid-rows-[1fr_auto] bg-black/95 p-3" onClick={() => setBig(null)}>
          <img src={photoUrl(big.id, "full")} alt={big.caption ?? "zdjęcie maszyny"} className="h-full w-full object-contain" />
          <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 py-3" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-muted">{big.caption ?? ""}</span>
            <div className="flex gap-2">
              <button className="min-h-11 rounded-lg border border-danger px-3 font-mono text-sm text-danger" onClick={() => void remove(big)}>
                usuń
              </button>
              <button className="min-h-11 rounded-lg border border-line px-3 font-mono text-sm" onClick={() => setBig(null)}>
                zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
