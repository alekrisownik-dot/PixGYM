import { useState } from "react";

import { errorText, type CalendarEvent, type EventKind } from "../api";
import { deleteEvent, saveEvent } from "../offline/events";
import { IconTrash } from "../ui/icons";
import { Button, ErrorText, Field, shortDate } from "../ui/kit";
import { Sheet } from "../ui/sheet";

/** Rodzaje wydarzeń: ikonka, nazwa i kolor kropki w kalendarzu. */
export const KINDS: ReadonlyArray<{ kind: EventKind; icon: string; label: string; color: string }> = [
  { kind: "workout", icon: "🏋️", label: "Trening", color: "var(--color-accent)" },
  { kind: "event", icon: "📌", label: "Wydarzenie", color: "var(--color-cyan)" },
  { kind: "competition", icon: "🏆", label: "Zawody", color: "var(--color-amber)" },
  { kind: "trip", icon: "✈️", label: "Wyjazd", color: "#b79cff" },
  { kind: "health", icon: "🩺", label: "Zdrowie", color: "var(--color-danger)" },
  { kind: "rest", icon: "😴", label: "Odpoczynek", color: "var(--color-muted)" },
];
export const kindOf = (k: EventKind) => KINDS.find((x) => x.kind === k) ?? KINDS[0]!;

/** Wiersz wydarzenia (lista dnia, „Dziś”). */
export function EventRow({ e, onClick, showDate }: { e: CalendarEvent; onClick?: () => void; showDate?: boolean }) {
  const k = kindOf(e.kind);
  return (
    <button onClick={onClick} className="card flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2" style={{ borderLeft: `4px solid ${k.color}` }}>
      <span className="text-2xl" aria-hidden>
        {k.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold">{e.title}</span>
        <span className="block truncate text-[13px] text-muted">
          {showDate ? `${shortDate(e.date)} · ` : ""}
          {e.note ?? k.label}
        </span>
      </span>
    </button>
  );
}

/** Dodawanie i edycja wydarzenia w panelu od dołu. */
export function EventSheet({
  initial,
  date,
  kind: initialKind = "event",
  planDays = [],
  onClose,
  onSaved,
}: {
  initial?: CalendarEvent;
  date: string;
  kind?: EventKind;
  /** Nazwy treningów z aktywnego planu: szybki wybór przy planowaniu treningu. */
  planDays?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [day, setDay] = useState(initial?.date ?? date);
  const [kind, setKind] = useState<EventKind>(initial?.kind ?? initialKind);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const body = { date: day, title: title.trim(), kind, note: note.trim() || null };
  // Przez kolejkę: działa też bez sieci, wyśle się samo.
  const save = () => run(() => saveEvent(body, initial?.id));
  const remove = () => confirm(`Usunąć „${initial!.title}”?`) && run(() => deleteEvent(initial!.id));

  return (
    <Sheet title={initial ? "Wydarzenie" : "Nowe wydarzenie"} onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => setKind(k.kind)}
              className={`grid min-h-16 place-items-center gap-0.5 rounded-xl border px-1 py-1.5 ${kind === k.kind ? "border-accent bg-accent/15" : "border-line"}`}
              aria-pressed={kind === k.kind}
            >
              <span className="text-2xl">{k.icon}</span>
              <span className={`text-[11px] leading-tight ${kind === k.kind ? "text-accent" : "text-muted"}`}>{k.label}</span>
            </button>
          ))}
        </div>
        {kind === "workout" && planDays.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {planDays.map((d) => (
              <button
                key={d}
                onClick={() => setTitle(d)}
                className={`min-h-10 rounded-full border px-3.5 font-mono text-[14px] font-semibold ${title === d ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <Field label="Nazwa" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={kind === "workout" ? "np. Klata + triceps" : kind === "competition" ? "np. Zawody w wyciskaniu" : "np. Urlop w górach"} />
        <Field label="Dzień" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <label className="grid gap-1.5">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">Notatka (opcjonalnie)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="np. ważenie o 8:00, kategoria do 83 kg"
            className="rounded-xl border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent"
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button onClick={() => void save()} disabled={busy || !title.trim() || !day}>
          {busy ? "zapisywanie…" : "✓ Zapisz"}
        </Button>
        {initial && (
          <Button variant="danger" onClick={() => void remove()} disabled={busy}>
            <IconTrash size={18} /> Usuń wydarzenie
          </Button>
        )}
        {!initial && day && <p className="text-center text-sm text-muted">Dzień: {shortDate(day)}. Wydarzenia widzisz tylko Ty.</p>}
      </div>
    </Sheet>
  );
}
