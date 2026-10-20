import { useState, type FormEvent } from "react";

import { api, errorText, type Me } from "../api";
import { Button, ErrorText, Field } from "../ui/kit";

export function Auth({ onDone }: { onDone: (me: Me) => void }) {
  // Link z zaproszeniem: https://.../#kod=XXXX-XXXX-XXXX-XXXX
  const inviteFromLink = new URLSearchParams(location.hash.replace(/^#\/?/, "")).get("kod") ?? "";
  const [mode, setMode] = useState<"login" | "register">(inviteFromLink ? "register" : "login");
  const [form, setForm] = useState({ email: "", password: "", display_name: "", invite_code: inviteFromLink });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me =
        mode === "login"
          ? await api.post<Me>("/auth/login", { email: form.email, password: form.password })
          : await api.post<Me>("/auth/register", form);
      if (inviteFromLink) history.replaceState(null, "", "/#/");
      onDone(me);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-md gap-6 px-4 pt-14 pb-10">
      <div>
        <p className="font-mono text-sm font-semibold text-accent">&gt; pixgym --{mode === "login" ? "login" : "register"}</p>
        <h1 className="mt-1 font-mono text-4xl font-bold tracking-tight">
          PixGYM<span className="cursor" aria-hidden />
        </h1>
        <p className="mt-2 text-muted">{mode === "login" ? "Zaloguj się, żeby zapisywać treningi." : "Załóż konto z kodem od znajomego."}</p>
      </div>

      <form onSubmit={submit} className="grid gap-4">
        {mode === "register" && (
          <>
            <Field label="Kod zaproszenia" value={form.invite_code} onChange={set("invite_code")} autoCapitalize="characters" autoComplete="off" placeholder="ABCD-EFGH-JKLM-NPQR" required />
            <Field label="Imię lub ksywka" hint="Widzą je znajomi w rankingu." value={form.display_name} onChange={set("display_name")} maxLength={50} required />
          </>
        )}
        <Field label="E-mail" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        <Field
          label="Hasło"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "register" ? 10 : undefined}
          hint={mode === "register" ? "Co najmniej 10 znaków." : undefined}
          value={form.password}
          onChange={set("password")}
          required
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Zaloguj" : "Załóż konto"}
        </Button>
      </form>

      <button className="min-h-12 font-mono text-sm text-accent underline-offset-4 hover:underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
        {mode === "login" ? "Mam kod zaproszenia →" : "← Mam już konto"}
      </button>
    </main>
  );
}
