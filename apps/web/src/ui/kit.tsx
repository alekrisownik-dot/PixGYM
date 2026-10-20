import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "outline";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-accent-ink font-bold shadow-[0_10px_28px_-12px_rgb(var(--accent-rgb)/.55)]",
    ghost: "card text-fg font-semibold",
    outline: "border border-accent/70 text-accent font-semibold bg-accent/5",
    danger: "bg-transparent border border-danger/70 text-danger font-semibold",
  };
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 font-mono text-base transition active:scale-[.98] disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <input
        className="min-h-13 w-full rounded-xl border border-line bg-bg/80 px-3.5 text-lg text-fg outline-none transition placeholder:text-muted/50 focus:border-accent focus:bg-bg"
        {...props}
      />
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  );
}

/** Ekran: mały „prompt” nad tytułem jak w terminalu, tytuł monospace, akcja po prawej. */
export function Screen({
  title,
  sub,
  kicker,
  children,
  action,
}: {
  title: string;
  sub?: ReactNode;
  kicker?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)] gap-5 px-4 pt-6 pb-32">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {kicker && <p className="font-mono text-xs font-semibold tracking-wide text-accent">&gt; {kicker}</p>}
          <h1 className="font-mono text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
          {sub && <p className="mt-1 font-mono text-[13px] text-muted">{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-0.5">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">{children}</h2>
      {right}
    </div>
  );
}

/** Kafelek z liczbą (makieta „Postęp”): etykieta, duża wartość, zmiana. */
export function Tile({ label, value, unit, delta, tone = "accent" }: { label: string; value: string; unit?: string; delta?: string; tone?: "accent" | "danger" | "muted" }) {
  const color = { accent: "text-accent", danger: "text-danger", muted: "text-muted" }[tone];
  return (
    <div className="card grid gap-0.5 p-3.5">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="num text-2xl font-bold">{value}</span>
        {unit && <span className="font-mono text-xs text-muted">{unit}</span>}
      </span>
      {delta && <span className={`num text-xs font-semibold ${color}`}>{delta}</span>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-3.5 py-2.5 text-[15px] text-danger">
      {children}
    </p>
  );
}

export function Loading() {
  return (
    <p className="py-12 text-center font-mono text-sm text-muted">
      ładowanie<span className="cursor" />
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-muted">{children}</p>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  full,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
  /** Jeden rząd na całą szerokość, równe pola (zakładki ekranu). */
  full?: boolean;
}) {
  if (full)
    return (
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line bg-surface/70 p-1" role="tablist">
        {options.map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={v === value}
            onClick={() => onChange(v)}
            className={`min-h-11 min-w-0 truncate rounded-xl px-1.5 font-mono text-[14px] font-semibold transition ${
              v === value ? "bg-accent text-accent-ink shadow-[0_6px_16px_-8px_rgb(var(--accent-rgb)/.6)]" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`min-h-10 rounded-full border px-4 font-mono text-[13px] font-semibold transition ${
            v === value ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface/60 text-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
      />
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
