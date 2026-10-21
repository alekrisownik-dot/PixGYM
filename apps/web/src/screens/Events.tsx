import { useState } from "react";

import { api, errorText, type CalendarEvent, type EventKind, type EventTemplate } from "../api";
import { useLoad } from "../app/useLoad";
import { pushState } from "../app/push";
import { deleteEvent, saveEvent } from "../offline/events";
import { cachedGet } from "../offline/sessions";
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
/** Emoji wydarzenia: z szablonu albo ikonka rodzaju. */
export const eventIcon = (e: { kind: EventKind; icon?: string | null }) => e.icon || kindOf(e.kind).icon;

// Emoji do wyboru w szablonach (pierwsze miejsce zajmuje ikonka rodzaju).
const EMOJI = ["💆", "🧘", "🏃", "🚴", "🏊", "⚽", "🥊", "🧗", "⛰️", "🍽️", "💊", "📸", "🎂", "🎉"];

/** Wiersz wydarzenia (lista dnia, „Dziś”). */
export function EventRow({ e, onClick, showDate }: { e: CalendarEvent; onClick?: () => void; showDate?: boolean }) {
  const k = kindOf(e.kind);
  return (
    <button onClick={onClick} className="card flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2" style={{ borderLeft: `4px solid ${k.color}` }}>
      <span className="text-2xl" aria-hidden>
        {eventIcon(e)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold">{e.title}</span>
        <span className="block truncate text-[13px] text-muted">
          {showDate ? `${shortDate(e.date)} · ` : ""}
          {e.note ?? k.label}
        </span>
      </span>
      {e.remind !== false && e.kind !== "workout" && (
        <span className="text-base opacity-70" aria-label="Przypomnienie dzień wcześniej">
          🔔
        </span>
      )}
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
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [remind, setRemind] = useState(initial?.remind ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templates = useLoad(() => cachedGet<EventTemplate[]>("/event-templates").catch(() => [] as EventTemplate[]), []);
  const push = useLoad(pushState, []);
  // Szablon, z którego wypełniono formularz (do aktualizacji) i tryb usuwania szablonów.
  const [fromTemplate, setFromTemplate] = useState<EventTemplate | null>(null);
  const [editTemplates, setEditTemplates] = useState(false);

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

  const body = { date: day, title: title.trim(), kind, note: note.trim() || null, icon, remind };
  const template = { title: title.trim(), icon, kind, note: note.trim() || null, remind };

  function apply(t: EventTemplate) {
    setTitle(t.title);
    setKind(t.kind);
    setIcon(t.icon);
    setNote(t.note ?? "");
    setRemind(t.remind);
    setFromTemplate(t);
  }

  async function saveTemplate() {
    setError(null);
    try {
      const saved = fromTemplate
        ? await api.put<EventTemplate>(`/event-templates/${fromTemplate.id}`, template)
        : await api.post<EventTemplate>("/event-templates", template);
      setFromTemplate(saved);
      void templates.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function removeTemplate(t: EventTemplate) {
    if (!confirm(`Usunąć szablon „${t.title}”?`)) return;
    try {
      await api.del(`/event-templates/${t.id}`);
      if (fromTemplate?.id === t.id) setFromTemplate(null);
      void templates.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const changedTemplate =
    fromTemplate != null &&
    (fromTemplate.title !== template.title || fromTemplate.icon !== icon || fromTemplate.kind !== kind || (fromTemplate.note ?? null) !== template.note || fromTemplate.remind !== remind);
  const list = templates.data ?? [];
  // Przez kolejkę: działa też bez sieci, wyśle się samo.
  const save = () => run(() => saveEvent(body, initial?.id));
  const remove = () => confirm(`Usunąć „${initial!.title}”?`) && run(() => deleteEvent(initial!.id));

  return (
    <Sheet title={initial ? "Wydarzenie" : "Nowe wydarzenie"} onClose={onClose}>
      <div className="grid gap-4">
        {!initial && list.length > 0 && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">Twoje szablony</span>
              <button onClick={() => setEditTemplates((v) => !v)} className="min-h-9 px-2 font-mono text-[13px] text-muted">
                {editTemplates ? "gotowe" : "✎ edytuj"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => (editTemplates ? void removeTemplate(t) : apply(t))}
                  className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-semibold ${
                    editTemplates ? "border-danger/60 text-danger" : fromTemplate?.id === t.id ? "border-accent bg-accent/15 text-accent" : "border-line"
                  }`}
                >
                  <span aria-hidden>{eventIcon(t)}</span>
                  {t.title}
                  {editTemplates && <span aria-label="usuń">✕</span>}
                </button>
              ))}
            </div>
          </div>
        )}
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
        <div className="grid gap-1.5">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">Ikonka</span>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {[null, ...EMOJI].map((em) => (
              <button
                key={em ?? "kind"}
                onClick={() => setIcon(em)}
                className={`grid size-12 shrink-0 place-items-center rounded-xl border text-2xl ${icon === em ? "border-accent bg-accent/15" : "border-line"}`}
                aria-pressed={icon === em}
                aria-label={em ?? "ikonka rodzaju"}
              >
                {em ?? kindOf(kind).icon}
              </button>
            ))}
          </div>
        </div>
        {kind === "workout" ? (
          <p className="card flex items-center gap-2.5 px-3.5 py-3 text-[15px]">
            <span className="text-2xl" aria-hidden>
              🤖
            </span>
            Dzień wcześniej wieczorem Bit zapyta, czy idziesz.
          </p>
        ) : (
          <label className="card flex min-h-14 items-center justify-between gap-3 px-3.5 py-2.5">
            <span className="text-[16px]">
              🔔 Przypomnij dzień wcześniej
              {remind && push.data !== "on" && <span className="block text-[13px] text-muted">Włącz powiadomienia w zakładce Ja → Ustawienia.</span>}
            </span>
            <input type="checkbox" className="size-6 shrink-0 accent-[var(--color-accent)]" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <Button onClick={() => void save()} disabled={busy || !title.trim() || !day}>
          {busy ? "zapisywanie…" : "✓ Zapisz"}
        </Button>
        {title.trim() && (!fromTemplate || changedTemplate) && (
          <Button variant="ghost" onClick={() => void saveTemplate()}>
            {fromTemplate ? `💾 Zaktualizuj szablon „${fromTemplate.title}”` : "💾 Zapisz jako szablon"}
          </Button>
        )}
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
