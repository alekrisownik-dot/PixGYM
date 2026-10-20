import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-accent-ink font-bold",
    ghost: "bg-surface border border-line text-fg font-semibold",
    danger: "bg-transparent border border-danger text-danger font-semibold",
  };
  return (
    <button
      className={`min-h-12 rounded-xl px-4 py-3 font-mono text-base active:scale-[.98] disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-sm font-semibold text-muted">{label}</span>
      <input
        className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-lg text-fg outline-none focus:border-accent"
        {...props}
      />
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function Screen({ title, sub, children, action }: { title: string; sub?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="mx-auto grid max-w-xl gap-4 px-4 pt-5 pb-28">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-mono text-2xl font-bold tracking-tight">{title}</h1>
          {sub && <p className="mt-0.5 font-mono text-sm text-muted">{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/60 bg-danger/10 px-3 py-2 text-danger">
      {children}
    </p>
  );
}

export function Loading() {
  return <p className="py-10 text-center font-mono text-muted">ładowanie<span className="cursor" /></p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-muted">{children}</p>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`min-h-10 rounded-full border px-4 font-mono text-sm font-semibold ${
            v === value ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

// --- formatowanie ---

export function kg(x: number | null | undefined, digits = 1): string {
  if (x == null) return "–";
  return Number.isInteger(x) ? String(x) : x.toFixed(digits).replace(/\.?0+$/, "");
}

export function tonnage(x: number): string {
  return x >= 1000 ? `${(x / 1000).toFixed(1)} t` : `${Math.round(x)} kg`;
}

const DAY = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" });
const SHORT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });

export function longDate(iso: string): string {
  return DAY.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
}

export function shortDate(iso: string): string {
  return SHORT.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

/** Odmiana po polsku: 1 seria, 2 serie, 5 serii, 22 serie. */
export function plural(n: number, one: string, few: string, many: string): string {
  const word = n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
  return `${n} ${word}`;
}

export const sets = (n: number) => plural(n, "seria", "serie", "serii");
export const changes = (n: number) => plural(n, "zmiana", "zmiany", "zmian");
export const days = (n: number) => plural(n, "dzień", "dni", "dni");
