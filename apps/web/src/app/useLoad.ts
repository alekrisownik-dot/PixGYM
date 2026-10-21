import { useCallback, useEffect, useRef, useState } from "react";

import { errorText } from "../api";
import { onFreshData, staleCount } from "../offline/sessions";

/** Dane z API dla ekranu: ładowanie, błąd, ponowne wczytanie i ręczna podmiana. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Dane mogą pochodzić z kopii w telefonie: wtedy czekamy na świeże z serwera.
  const [stale, setStale] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    const before = staleCount();
    try {
      const value = await load();
      if (mine === seq.current) {
        setData(value);
        setStale(staleCount() !== before);
      }
    } catch (e) {
      if (mine === seq.current) setError(errorText(e));
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!stale) return;
    // Kilka odpowiedzi naraz (różne zapytania ekranu): wczytujemy raz.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onFreshData(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 100);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [stale, reload]);

  return { data, error, reload, setData };
}
