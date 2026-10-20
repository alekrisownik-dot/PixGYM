import { useEffect, type ReactNode } from "react";

/** Panel wysuwany od dołu (szczegóły chowane za dotknięciem, zamiast rozwijać ekran). */
export function Sheet({ title, onClose, children }: { title?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal>
      <div
        className="sheet-in safe-bottom mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-4 pt-2 pb-6 shadow-[0_-20px_40px_-20px_rgba(0,0,0,.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {title && <div className="mb-3 font-mono text-lg font-bold">{title}</div>}
        {children}
      </div>
    </div>
  );
}
