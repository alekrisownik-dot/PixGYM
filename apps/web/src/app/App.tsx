import { useCallback, useEffect, useState } from "react";

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
import { IconCloudOff, IconRefresh } from "../ui/icons";
import { PixelIcon, type PixelIconName } from "../ui/pixel-icons";
import { Button, Loading, changes } from "../ui/kit";
import { Celebrations } from "../ui/celebrate";
import { UpdateBar } from "../ui/update";
import { Toasts } from "../ui/toast";
import { href, useRoute, type Route } from "./router";

const TABS: ReadonlyArray<{ route: Route; label: string; icon: PixelIconName; match: Route["name"][] }> = [
  { route: { name: "today" }, label: "Dziś", icon: "home", match: ["today"] },
  { route: { name: "history" }, label: "Trening", icon: "dumbbell", match: ["history", "workout", "summary"] },
  { route: { name: "plans" }, label: "Plany", icon: "plan", match: ["plans", "plan"] },
  { route: { name: "progress" }, label: "Postęp", icon: "chart", match: ["progress", "exercise"] },
  { route: { name: "me" }, label: "Ja", icon: "user", match: ["me"] },
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

const dayKey = () => new Date().toDateString();

/**
 * Telefon trzyma aplikację w pamięci całymi godzinami. Po północy albo po dłuższej nieobecności
 * ekran pokazywałby wczorajszy dzień i stare dane, więc wtedy przeładowujemy bieżący ekran.
 */
function useFreshness(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let day = dayKey();
    let hiddenAt = 0;
    const bump = () => {
      day = dayKey();
      setTick((t) => t + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (dayKey() !== day || (hiddenAt && Date.now() - hiddenAt > 5 * 60_000)) bump();
    };
    // Północ przy otwartej aplikacji (sprawdzamy co minutę, timer usypiany z ekranem i tak nie trafi).
    const timer = setInterval(() => dayKey() !== day && document.visibilityState === "visible" && bump(), 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return tick;
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);
  const route = useRoute();
  const fresh = useFreshness();

  const loadMe = useCallback(() => {
    setUnreachable(false);
    // Ostatnio znane konto od razu: przy słabym zasięgu nie czekamy na serwer z pustym ekranem.
    void kv.get<Me>("get:/me").then((m) => m && setMe((cur) => (cur === undefined ? m : cur)));
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
      <Celebrations />
      <SyncBar />
      <UpdateBar />
      {/* Klucz „fresh”: nowy dzień albo powrót po przerwie wczytuje ekran od nowa (trening zostaje). */}
      {route.name === "today" && <Today key={fresh} me={me} />}
      {route.name === "history" && <History key={fresh} />}
      {route.name === "workout" && <Workout key={route.id} id={route.id} />}
      {route.name === "summary" && <Summary key={route.id} id={route.id} />}
      {route.name === "plans" && <Plans key={fresh} />}
      {route.name === "plan" && <PlanEditor key={route.id} id={route.id} />}
      {route.name === "progress" && <Progress key={fresh} />}
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
                  <PixelIcon name={t.icon} size={20} />
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
