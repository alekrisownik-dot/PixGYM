import { useEffect, useState } from "react";

import { Bit } from "./mascot";

/** Krótki komunikat u góry ekranu (np. nowy rekord), znika sam. */
export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "record" | "info";
}

const EVENT = "pixgym:toast";
let seq = 0;

export function toast(t: Omit<Toast, "id">) {
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { ...t, id: ++seq } }));
}

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.tone === "record" ? 4500 : 2500);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 grid justify-items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
      {items.map((t) => (
        <div
          key={t.id}
          className={`toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${
            t.tone === "record" ? "border-amber/80 bg-[#1f1a10]/95 text-amber" : "border-line bg-surface/95 text-fg"
          }`}
          role="status"
        >
          {t.tone === "record" && (
            <span className="record-burst relative grid size-12 shrink-0 place-items-center rounded-xl bg-amber/15">
              <Bit mood="flex" size={40} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block font-mono text-[15px] font-bold">{t.title}</span>
            {t.body && <span className="block text-[13px] text-fg/80">{t.body}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
