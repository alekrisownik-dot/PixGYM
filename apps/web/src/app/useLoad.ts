import { useCallback, useEffect, useRef, useState } from "react";

import { errorText } from "../api";

/** Dane z API dla ekranu: ładowanie, błąd, ponowne wczytanie i ręczna podmiana. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    try {
      const value = await load();
      if (mine === seq.current) setData(value);
    } catch (e) {
      if (mine === seq.current) setError(errorText(e));
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload, setData };
}
