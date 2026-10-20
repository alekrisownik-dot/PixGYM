import { useState } from "react";

import { api, errorText, type Badge, type LeaderboardRow, type Me, type Settings } from "../api";
import { useLoad } from "../app/useLoad";
import { kv, outbox } from "../offline/db";
import { cachedGet } from "../offline/sessions";
import { Button, Card, Empty, ErrorText, Loading, ProgressBar, Screen, Segmented, clock, kg, shortDate, changes } from "../ui/kit";

const LIFTS = [
  ["bench_press", "Wyciskanie"],
  ["pull_up", "Podciąganie"],
  ["dip", "Poręcze"],
  ["concentration_curl", "Uginanie"],
] as const;
type Lift = (typeof LIFTS)[number][0];

function Leaderboard({ visible }: { visible: boolean }) {
  const [lift, setLift] = useState<Lift>("bench_press");
  const [metric, setMetric] = useState<"kg" | "dots">("kg");
  const { data, error } = useLoad(() => cachedGet<LeaderboardRow[]>(`/leaderboard/${lift}?metric=${metric}`), [lift, metric, visible]);

  return (
    <section className="grid gap-3">
      <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Ranking znajomych</h2>
      <Segmented value={lift} options={LIFTS} onChange={setLift} />
      <Segmented value={metric} options={[["kg", "kg"], ["dots", "DOTS"]] as const} onChange={setMetric} />
      <ErrorText>{error}</ErrorText>
      {!visible && <Card><p className="text-muted">Jesteś ukryty, więc nie widzisz też innych. Włącz widoczność niżej.</p></Card>}
      {visible && !data && !error && <Loading />}
      {visible && data?.length === 0 && <Empty>Nikt jeszcze nie ma wyniku w tym boju.</Empty>}
      {visible && data && data.length > 0 && (
        <Card className="grid p-2">
          {data.map((r, i) => (
            <div key={i} className={`grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-lg px-2 py-2.5 ${r.is_me ? "bg-accent/10" : ""}`}>
              <span className="num text-lg font-bold text-muted">{r.position}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.display_name}{r.is_me && " (ty)"}</p>
                {r.title && <p className="font-mono text-xs text-accent">{r.title}</p>}
              </div>
              <span className="num text-lg font-bold">{metric === "kg" ? `${kg(r.value)} kg` : kg(r.value)}</span>
            </div>
          ))}
        </Card>
      )}
      {metric === "dots" && <p className="text-sm text-muted">DOTS liczy siłę względem masy ciała. Wymaga płci w profilu i masy ciała z treningu.</p>}
    </section>
  );
}

function Badges() {
  const { data, error } = useLoad(() => cachedGet<Badge[]>("/badges"), []);
  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">
        Odznaki {data && `· ${data.filter((b) => b.earned_at).length}/${data.length}`}
      </h2>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      <div className="grid grid-cols-2 gap-2">
        {data?.map((b) => (
          <Card key={b.slug} className={`grid gap-1.5 p-3 ${b.earned_at ? "border-accent/60" : "opacity-70"}`}>
            <p className={`font-mono font-bold ${b.earned_at ? "text-accent" : "text-muted"}`}>{b.title}</p>
            <p className="text-sm leading-snug text-muted">{b.description}</p>
            {b.earned_at ? <p className="font-mono text-xs text-accent">✓ {shortDate(b.earned_at)}</p> : <ProgressBar value={b.progress} />}
          </Card>
        ))}
      </div>
    </section>
  );
}

function Invites() {
  const { data, reload } = useLoad(() => api.get<{ created_at: string; expires_at: string; used_at: string | null }[]>("/invites"), []);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = code ? `${location.origin}/#kod=${code}` : "";

  async function create() {
    setError(null);
    setCopied(false);
    try {
      setCode((await api.post<{ code: string }>("/invites")).code);
      void reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function share() {
    const text = `Zaproszenie do PixGYM (ważne 7 dni): ${link}\nKod: ${code}`;
    if (navigator.share) {
      await navigator.share({ title: "PixGYM", text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    }
  }

  const active = data?.filter((i) => !i.used_at && new Date(i.expires_at) > new Date()).length ?? 0;

  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Zaproszenia (admin)</h2>
      <Card className="grid gap-3">
        <p className="text-muted">
          Kod jest jednorazowy i ważny 7 dni. Znajomy musi też być w Twojej sieci Tailscale, żeby otworzyć aplikację.
        </p>
        {code && (
          <div className="grid gap-2 rounded-xl border border-accent bg-accent/10 p-3">
            <p className="num text-center text-2xl font-bold tracking-wider text-accent select-all">{code}</p>
            <Button onClick={share}>{copied ? "✓ Skopiowano" : "Udostępnij link"}</Button>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <Button variant="ghost" onClick={create}>
          + Nowy kod
        </Button>
        {data && (
          <p className="text-sm text-muted">
            Aktywne: {active} · wykorzystane: {data.filter((i) => i.used_at).length}
          </p>
        )}
      </Card>
    </section>
  );
}

const REST = [60, 90, 120, 150, 180, 240, 300] as const;

function TrainingSettings() {
  const { data, setData, error: loadError } = useLoad(() => cachedGet<Settings>("/me/settings"), []);
  const [error, setError] = useState<string | null>(null);
  const [bar, setBar] = useState<string | null>(null);

  async function patch(body: Partial<Settings>) {
    setError(null);
    try {
      setData(await api.patch<Settings>("/me/settings", body));
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Trening</h2>
      <Card className="grid gap-4">
        <div className="grid gap-1.5">
          <span className="font-mono text-sm font-semibold text-muted">Domyślna przerwa</span>
          {data && (
            <Segmented
              value={String(data.default_rest_s)}
              options={REST.map((r) => [String(r), clock(r)] as const)}
              onChange={(v) => void patch({ default_rest_s: Number(v) })}
            />
          )}
          <span className="text-sm text-muted">Dla pojedynczego ćwiczenia zmienisz ją przyciskiem ⏱ w treningu.</span>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span>Waga gryfu</span>
          <span className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={bar ?? String(data?.bar_weight_kg ?? "")}
              onChange={(e) => setBar(e.target.value)}
              onBlur={() => {
                const v = Number((bar ?? "").replace(",", "."));
                if (bar !== null && v >= 0 && v <= 50) void patch({ bar_weight_kg: v });
                setBar(null);
              }}
              className="num min-h-11 w-20 rounded-lg border border-line bg-bg px-2 text-right text-lg outline-none focus:border-accent"
            />
            <span className="text-muted">kg</span>
          </span>
        </label>
        <ErrorText>{error ?? loadError}</ErrorText>
      </Card>
    </section>
  );
}

export function MeScreen({ me, onChange, onLogout }: { me: Me; onChange: (m: Me) => void; onLogout: () => void }) {
  const [name, setName] = useState(me.display_name);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Partial<Me>) {
    setError(null);
    try {
      onChange(await api.patch<Me>("/me", body));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function logout() {
    const pending = (await outbox.all()).length;
    if (pending && !confirm(`Na serwer nie doszło jeszcze: ${changes(pending)}. Po wylogowaniu przepadnie. Wylogować?`)) return;
    await api.post("/auth/logout").catch(() => {});
    // Dane treningowe nie zostają w telefonie po wylogowaniu.
    await Promise.all([kv.clear(), outbox.clear(), caches?.delete("pixgym-photos-v1")]);
    onLogout();
  }

  return (
    <Screen title="Ja" sub={me.email}>
      <Leaderboard visible={me.leaderboard_visible} />
      <Badges />

      <section className="grid gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">Profil</h2>
        <Card className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="font-mono text-sm font-semibold text-muted">Imię w rankingu</span>
            <input
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== me.display_name && patch({ display_name: name.trim() })}
              className="min-h-12 rounded-xl border border-line bg-bg px-3 text-lg outline-none focus:border-accent"
            />
          </label>
          <div className="grid gap-1.5">
            <span className="font-mono text-sm font-semibold text-muted">Płeć (do rang i DOTS)</span>
            <Segmented
              value={me.sex ?? ""}
              options={[["male", "mężczyzna"], ["female", "kobieta"]] as const}
              onChange={(v) => patch({ sex: v as Me["sex"] })}
            />
          </div>
          <label className="flex min-h-12 items-center justify-between gap-3">
            <span>
              Widoczny w rankingu
              <span className="block text-sm text-muted">Ukryty nie widzi też innych.</span>
            </span>
            <input
              type="checkbox"
              className="size-6 accent-[var(--color-accent)]"
              checked={me.leaderboard_visible}
              onChange={(e) => patch({ leaderboard_visible: e.target.checked })}
            />
          </label>
          <ErrorText>{error}</ErrorText>
        </Card>
      </section>

      <TrainingSettings />

      {me.role === "admin" && <Invites />}

      <Button variant="danger" onClick={logout}>
        Wyloguj
      </Button>
    </Screen>
  );
}
