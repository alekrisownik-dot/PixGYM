import { useState } from "react";

import { api, errorText, type Plan, type PlanListItem } from "../api";
import { go, href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { IconChevronRight } from "../ui/icons";
import { Button, ErrorText, Loading, Screen, SectionTitle, Segmented } from "../ui/kit";
import { Bit, BitPeek, BitSays } from "../ui/mascot";
import { Sheet } from "../ui/sheet";
import { WEEKDAYS_LONG, weekdayOf } from "./plan-format";

const SEEN_KEY = "pixgym_bit_plans_seen";

const FREQ = [
  ["3", "2–3 dni"],
  ["4", "4 dni"],
  ["5", "5+ dni"],
] as const;
const LEVEL = [
  ["new", "Zaczynam"],
  ["mid", "Rok+"],
  ["pro", "Kilka lat"],
] as const;
type Freq = (typeof FREQ)[number][0];
type Level = (typeof LEVEL)[number][0];

// Który gotowy plan Bit poleca (szukamy po fragmencie nazwy szablonu).
const PICK: Record<Freq, Record<Level, string>> = {
  "3": { new: "FBW", mid: "Push / Pull", pro: "Push / Pull" },
  "4": { new: "Upper / Lower", mid: "GZCLP", pro: "5/3/1" },
  "5": { new: "Push / Pull", mid: "nSuns", pro: "nSuns" },
};

/** Bit zadaje dwa pytania i poleca gotowy plan; reszta szablonów niżej. */
function Suggest({ templates, busy, onUse, onClose }: { templates: PlanListItem[]; busy: string | null; onUse: (id: string) => void; onClose: () => void }) {
  const [freq, setFreq] = useState<Freq>("3");
  const [level, setLevel] = useState<Level>("new");
  const pick = templates.find((t) => t.name.includes(PICK[freq][level])) ?? templates[0];
  const others = templates.filter((t) => t.id !== pick?.id);

  return (
    <Sheet onClose={onClose}>
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Bit mood="lift" size={56} />
          <p className="text-[17px] leading-snug">Powiedz mi dwie rzeczy, a dobiorę plan.</p>
        </div>
        <div className="grid gap-2">
          <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-muted">Ile razy w tygodniu?</span>
          <Segmented value={freq} options={FREQ} onChange={setFreq} full />
        </div>
        <div className="grid gap-2">
          <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-muted">Jak długo trenujesz?</span>
          <Segmented value={level} options={LEVEL} onChange={setLevel} full />
        </div>

        {pick && (
          <div className="card glow grid gap-2 p-4">
            <span className="font-mono text-[12px] font-semibold text-accent">&gt; bit poleca</span>
            <span className="text-[22px] leading-tight font-bold">{pick.name}</span>
            <span className="text-[15px] text-muted">{pick.description}</span>
            <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
              <Button onClick={() => onUse(pick.id)} disabled={!!busy}>
                {busy === pick.id ? "kopiowanie…" : "Biorę ten plan"}
              </Button>
              <a href={href({ name: "plan", id: pick.id })} className="grid min-h-12 place-items-center rounded-xl border border-line px-4 font-mono text-sm">
                podgląd
              </a>
            </div>
          </div>
        )}

        <SectionTitle>Inne gotowe plany</SectionTitle>
        <div className="card grid px-1 py-1">
          {others.map((t) => (
            <div key={t.id} className="flex items-center gap-2 border-b border-line/70 px-3 py-2.5 last:border-0">
              <a href={href({ name: "plan", id: t.id })} className="min-w-0 flex-1">
                <span className="block font-semibold">{t.name}</span>
                <span className="line-clamp-2 block text-[14px] text-muted">{t.description}</span>
              </a>
              <button onClick={() => onUse(t.id)} disabled={!!busy} className="min-h-11 shrink-0 rounded-xl border border-accent/70 px-3 font-mono text-[14px] font-semibold text-accent disabled:opacity-50">
                {busy === t.id ? "…" : "Użyj"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">Gotowy plan kopiuje się do Twoich planów. Potem możesz w nim zmieniać dni i ćwiczenia.</p>
      </div>
    </Sheet>
  );
}

export function Plans() {
  const { data, error, reload } = useLoad(() => cachedGet<PlanListItem[]>("/programs"), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  // Dymek „Psst…” tylko do pierwszego otwarcia propozycji; potem Bit samo się wychyla.
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const openSuggest = () => {
    setSuggest(true);
    setSeen(true);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* tryb prywatny */
    }
  };
  const mine = (data?.filter((p) => !p.builtin) ?? []).sort((a, b) => Number(b.active) - Number(a.active));
  const templates = data?.filter((p) => p.builtin) ?? [];
  const active = mine.find((p) => p.active);
  const rest = mine.filter((p) => !p.active);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const create = () =>
    act("new", async () => {
      const today = weekdayOf(new Date());
      const plan = await api.post<Plan>("/programs", {
        name: "Mój plan",
        days: [{ name: WEEKDAYS_LONG[today], weekdays: [today], blocks: [] }],
      });
      if (!active) await api.put("/me/active-program", { program_id: plan.id });
      go({ name: "plan", id: plan.id });
    });

  const useTemplate = (id: string) =>
    act(id, async () => {
      const plan = await api.post<Plan>(`/programs/${id}/copy`);
      // Plan polecony przez Bita od razu staje się aktywny: po to się go wybiera.
      await api.put("/me/active-program", { program_id: plan.id });
      go({ name: "plan", id: plan.id });
    });

  const activate = (id: string) =>
    act(id, async () => {
      await api.put("/me/active-program", { program_id: id });
      await reload();
    });

  return (
    <Screen
      kicker="plany"
      title="Plany"
      action={
        <button className="min-h-11 whitespace-nowrap rounded-xl bg-accent px-4 font-mono font-bold text-accent-ink disabled:opacity-50" disabled={!!busy} onClick={() => void create()}>
          + Własny
        </button>
      }
    >
      <ErrorText>{actionError ?? error}</ErrorText>
      {!data && !error && <Loading />}

      {data && mine.length === 0 && (
        <>
          <BitSays mood="idle" size={84}>
            Nie masz jeszcze planu. Mam kilka sprawdzonych, dobiorę Ci coś w 10 sekund.
          </BitSays>
          <Button className="min-h-14 text-lg" onClick={openSuggest}>
            Pokaż, co polecasz
          </Button>
        </>
      )}

      {active && (
        <a href={href({ name: "plan", id: active.id })} className="card glow grid gap-1.5 p-4 active:bg-surface-2">
          <span className="font-mono text-[12px] font-semibold text-accent">&gt; aktywny plan</span>
          <span className="flex items-center justify-between gap-2">
            <span className="text-[24px] leading-tight font-bold">{active.name}</span>
            <IconChevronRight size={22} className="shrink-0 text-muted" />
          </span>
          <span className="text-[15px] text-muted">{active.days} dni treningowych · dotknij, żeby edytować</span>
        </a>
      )}

      {rest.length > 0 && (
        <section className="grid gap-2">
          <SectionTitle>{active ? "Pozostałe plany" : "Twoje plany"}</SectionTitle>
          <div className="card grid px-1 py-1">
            {rest.map((p) => (
              <div key={p.id} className="flex items-center gap-2 border-b border-line/70 px-3 py-2.5 last:border-0">
                <a href={href({ name: "plan", id: p.id })} className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold">{p.name}</span>
                  <span className="block text-[14px] text-muted">{p.days} dni treningowych</span>
                </a>
                <button onClick={() => void activate(p.id)} disabled={!!busy} className="min-h-11 shrink-0 rounded-xl border border-line px-3 font-mono text-[13px] text-muted disabled:opacity-50">
                  {busy === p.id ? "…" : "ustaw aktywny"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && mine.length > 0 && templates.length > 0 && (
        <BitPeek onClick={openSuggest} label="Bit poleca gotowy plan">
          {!seen && "Psst… mam gotowe plany. Pokazać?"}
        </BitPeek>
      )}

      {suggest && <Suggest templates={templates} busy={busy} onUse={(id) => void useTemplate(id)} onClose={() => setSuggest(false)} />}
    </Screen>
  );
}
