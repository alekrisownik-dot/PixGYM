import { useState } from "react";

import { api, errorText, type Plan, type PlanListItem } from "../api";
import { go, href } from "../app/router";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { Card, ErrorText, Loading, Screen } from "../ui/kit";
import { WEEKDAYS_LONG, weekdayOf } from "./plan-format";

export function Plans() {
  const { data, error } = useLoad(() => cachedGet<PlanListItem[]>("/programs"), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mine = data?.filter((p) => !p.builtin) ?? [];
  const templates = data?.filter((p) => p.builtin) ?? [];

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
      if (!mine.some((p) => p.active)) await api.put("/me/active-program", { program_id: plan.id });
      go({ name: "plan", id: plan.id });
    });

  const useTemplate = (id: string) =>
    act(id, async () => {
      const plan = await api.post<Plan>(`/programs/${id}/copy`);
      if (!mine.some((p) => p.active)) await api.put("/me/active-program", { program_id: plan.id });
      go({ name: "plan", id: plan.id });
    });

  return (
    <Screen
      title="Plany"
      sub="dni tygodnia i bloczki ćwiczeń"
      action={
        <button className="min-h-11 whitespace-nowrap rounded-xl bg-accent px-4 font-mono font-bold text-accent-ink disabled:opacity-50" disabled={!!busy} onClick={() => void create()}>
          + Nowy
        </button>
      }
    >
      <ErrorText>{actionError ?? error}</ErrorText>
      {!data && !error && <Loading />}

      {data && (
        <section className="grid gap-2">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Twoje plany</h2>
          {mine.length === 0 && (
            <Card>
              <p className="text-lg">Nie masz jeszcze planu.</p>
              <p className="mt-1 text-muted">Weź gotowy plan z listy niżej i dopasuj go, albo zbuduj własny przyciskiem „+ Nowy”.</p>
            </Card>
          )}
          {mine.map((p) => (
            <a key={p.id} href={href({ name: "plan", id: p.id })} className={`grid gap-1 rounded-2xl border bg-surface px-4 py-3.5 active:bg-surface-2 ${p.active ? "border-accent" : "border-line"}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-lg font-bold">{p.name}</span>
                {p.active && <span className="rounded-full bg-accent px-2.5 py-0.5 font-mono text-xs font-bold text-accent-ink">aktywny</span>}
              </span>
              <span className="font-mono text-sm text-muted">{p.days} dni treningowych</span>
            </a>
          ))}
        </section>
      )}

      {templates.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Gotowe plany</h2>
          {templates.map((p) => (
            <Card key={p.id} className="grid gap-2">
              <a href={href({ name: "plan", id: p.id })} className="grid gap-1">
                <span className="text-lg font-bold">{p.name}</span>
                <span className="text-muted">{p.description}</span>
              </a>
              <button
                onClick={() => void useTemplate(p.id)}
                disabled={!!busy}
                className="min-h-12 rounded-xl border border-accent font-mono font-semibold text-accent disabled:opacity-50"
              >
                {busy === p.id ? "kopiowanie…" : "Użyj tego planu"}
              </button>
            </Card>
          ))}
        </section>
      )}
    </Screen>
  );
}
