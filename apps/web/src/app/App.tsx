import { useCallback, useEffect, useState, type ReactNode } from "react";

import { ApiError, setLoggedOutHandler, type Me } from "../api";
import { kv, outbox } from "../offline/db";
import { cachedGet } from "../offline/sessions";
import { dismissRejected, flush, startSync, subscribe, type SyncState } from "../offline/sync";
import { Auth } from "../screens/Auth";
import { ExerciseProgress } from "../screens/ExerciseProgress";
import { History } from "../screens/History";
import { MeScreen } from "../screens/Me";
import { PlanEditor } from "../screens/PlanEditor";
import { Plans } from "../screens/Plans";
import { Progress } from "../screens/Progress";
import { Summary } from "../screens/Summary";
import { Today } from "../screens/Today";
import { Workout } from "../screens/Workout";
import { IconChart, IconCloudOff, IconDumbbell, IconGrid, IconHome, IconRefresh, IconUser } from "../ui/icons";
import { Button, Loading, changes } from "../ui/kit";
import { Toasts } from "../ui/toast";
import { href, useRoute, type Route } from "./router";

const TABS: ReadonlyArray<{ route: Route; label: string; Icon: (p: { size?: number }) => ReactNode; match: Route["name"][] }> = [
  { route: { name: "today" }, label: "Dziś", Icon: IconHome, match: ["today"] },
  { route: { name: "history" }, label: "Trening", Icon: IconDumbbell, match: ["history", "workout", "summary"] },
  { route: { name: "plans" }, label: "Plany", Icon: IconGrid, match: ["plans", "plan"] },
  { route: { name: "progress" }, label: "Postęp", Icon: IconChart, match: ["progress", "exercise"] },
  { route: { name: "me" }, label: "Ja", Icon: IconUser, match: ["me"] },
];

/** Pasek stanu synchronizacji: widoczny tylko, gdy coś czeka albo coś poszło nie tak. */
function SyncBar() {
  const [s, setS] = useState<SyncState | null>(null);
  useEffect(() => subscribe(setS), []);
  if (!s || (!s.pending && !s.rejected.length)) return null;
  return (
    <div className="mx-auto max-w-xl px-4 pt-2">
      {s.pending > 0 && (
        <p className={`flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-[13px] ${s.offline ? "border-amber/60 bg-amber/10 text-amber" : "border-line bg-surface text-muted"}`}>
          {s.offline ? <IconCloudOff size={18} /> : <IconRefresh size={18} className="animate-spin" />}
          {s.offline ? `offline · ${changes(s.pending)} w telefonie, wyśle się samo` : `wysyłanie: ${changes(s.pending)}…`}
        </p>
      )}
      {s.rejected.length > 0 && (
        <button onClick={dismissRejected} className="mt-2 w-full rounded-xl border border-danger px-3 py-2 text-left text-sm text-danger">
          Serwer odrzucił: {changes(s.rejected.length)} (np. błędne dane). Dotknij, żeby ukryć.
        </button>
      )}
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);
  const route = useRoute();

  const loadMe = useCallback(() => {
    setUnreachable(false);
    // Bez sieci wpuszczamy z ostatnio znanym kontem: trening działa offline.
    cachedGet<Me>("/me")
      .then(setMe)
      .catch((e) => (e instanceof ApiError ? setMe(null) : setUnreachable(true)));
  }, []);

  useEffect(() => {
    setLoggedOutHandler(() => setMe(null));
    loadMe();
    startSync();
  }, [loadMe]);

  const signIn = useCallback((m: Me) => {
    // Inne konto niż ostatnio: czyścimy pamięć podręczną poprzedniego.
    void kv.get<Me>("get:/me").then(async (prev) => {
      // Kolejka poprzedniego konta też znika, inaczej trafiłaby na nowe konto.
      if (prev && prev.id !== m.id) await Promise.all([kv.clear(), outbox.clear()]);
      await kv.set("get:/me", m);
      setMe(m);
      void flush();
    });
  }, []);

  if (unreachable)
    return (
      <main className="mx-auto grid max-w-md gap-4 px-4 pt-16">
        <h1 className="font-mono text-2xl font-bold">Brak połączenia</h1>
        <p className="text-muted">Nie da się połączyć z serwerem PixGYM. Sprawdź, czy Tailscale jest włączony. Po pierwszym zalogowaniu aplikacja działa też bez sieci.</p>
        <Button onClick={loadMe}>Spróbuj ponownie</Button>
      </main>
    );
  if (me === undefined) return <Loading />;
  if (me === null) return <Auth onDone={signIn} />;

  return (
    <>
      <Toasts />
      <SyncBar />
      {route.name === "today" && <Today me={me} />}
      {route.name === "history" && <History />}
      {route.name === "workout" && <Workout key={route.id} id={route.id} />}
      {route.name === "summary" && <Summary key={route.id} id={route.id} />}
      {route.name === "plans" && <Plans />}
      {route.name === "plan" && <PlanEditor key={route.id} id={route.id} />}
      {route.name === "progress" && <Progress />}
      {route.name === "exercise" && <ExerciseProgress key={route.id} id={route.id} />}
      {route.name === "me" && (
        <MeScreen
          me={me}
          onChange={(m) => {
            setMe(m);
            void kv.set("get:/me", m);
          }}
          onLogout={() => setMe(null)}
        />
      )}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line/80 bg-bg/90 backdrop-blur-lg">
        <div className="mx-auto grid max-w-xl grid-cols-5 px-1">
          {TABS.map((t) => {
            const on = t.match.includes(route.name);
            return (
              <a
                key={t.label}
                href={href(t.route)}
                className={`grid place-items-center gap-1 pt-2 pb-2.5 font-mono text-[11px] font-semibold ${on ? "text-accent" : "text-muted"}`}
                aria-current={on ? "page" : undefined}
              >
                <span className={`grid h-8 w-14 place-items-center rounded-full transition ${on ? "bg-accent/15" : ""}`}>
                  <t.Icon size={22} />
                </span>
                {t.label}
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}
