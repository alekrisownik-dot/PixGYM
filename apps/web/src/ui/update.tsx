import { useEffect, useState } from "react";

import { IconRefresh } from "./icons";

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;

/** Wersja na serwerze, albo null bez sieci. */
async function serverBuild(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as { build: string }).build : null;
  } catch {
    return null;
  }
}

/**
 * Pasek „Jest nowa wersja”: sprawdza przy powrocie do aplikacji i co 15 minut.
 * Nie przeładowuje sam, żeby nie przerwać wpisywania serii.
 */
export function UpdateBar() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const check = () => void serverBuild().then((b) => b && b !== APP_BUILD && setReady(true));
    const onVisible = () => document.visibilityState === "visible" && check();
    check();
    const timer = setInterval(check, 15 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (!ready) return null;
  return (
    <div className="mx-auto max-w-xl px-4 pt-2">
      <button
        onClick={() => location.reload()}
        className="flex w-full items-center gap-2 rounded-xl border border-accent/60 bg-accent/10 px-3 py-2 text-left font-mono text-[13px] text-accent"
      >
        <IconRefresh size={18} />
        <span className="flex-1">Jest nowa wersja PixGYM</span>
        <span className="font-semibold underline">Odśwież</span>
      </button>
    </div>
  );
}
