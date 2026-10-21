import { useState } from "react";

import { api, errorText, uuid7, type BodyData, type Measurement, type Pose, type ProgressPhoto } from "../api";
import { useLoad } from "../app/useLoad";
import { cachedGet } from "../offline/sessions";
import { IconCamera, IconTrash } from "../ui/icons";
import { bodyPhotoUrl, shrinkImage } from "../ui/image";
import { usePhotoPicker } from "../ui/photo-input";
import { PhotoLab } from "./body-photos";
import { Button, Card, ErrorText, Field, Loading, SectionTitle, Segmented, kg, shortDate } from "../ui/kit";
import { BitSays } from "../ui/mascot";
import { Sheet } from "../ui/sheet";
import { toast } from "../ui/toast";

/** Sylwetka: zdjęcia postępu (zaszyfrowane, tylko dla Ciebie) z porównaniem i pomiary ciała. */

const POSES = [
  ["front", "Przód"],
  ["side", "Bok"],
  ["back", "Tył"],
] as const;
const POSE_NAME: Record<Pose, string> = { front: "przód", side: "bok", back: "tył", other: "inne" };

const FIELDS: ReadonlyArray<readonly [keyof Measurement, string, string]> = [
  ["weight_kg", "Waga", "kg"],
  ["waist_cm", "Talia", "cm"],
  ["chest_cm", "Klatka", "cm"],
  ["arm_cm", "Ramię", "cm"],
  ["thigh_cm", "Udo", "cm"],
  ["hip_cm", "Biodra", "cm"],
  ["body_fat_pct", "Tłuszcz", "%"],
];

function Consent({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <BitSays mood="idle">
        Zdjęcia sylwetki i pomiary pokażą, co się zmienia, nawet gdy waga stoi. Widzisz je <b className="text-accent">tylko Ty</b>.
      </BitSays>
      <Card className="grid gap-3">
        <ul className="grid gap-1.5 text-[15px] text-muted">
          <li>• Zdjęcia są szyfrowane na serwerze, bez GPS i metadanych.</li>
          <li>• Nie trafiają do rankingu ani do znajomych.</li>
          <li>• Możesz je usunąć w każdej chwili.</li>
        </ul>
        <ErrorText>{error}</ErrorText>
        <Button
          onClick={() =>
            void api
              .put("/body/consent", { consent: true })
              .then(onDone)
              .catch((e) => setError(errorText(e)))
          }
        >
          Włączam moduł sylwetki
        </Button>
      </Card>
    </div>
  );
}

function AddMeasurement({ last, onClose, onSaved }: { last?: Measurement; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { id: uuid7() };
    for (const [k] of FIELDS) {
      const v = values[k]?.trim();
      if (v) body[k] = Number(v.replace(",", "."));
    }
    try {
      await api.post("/body/measurements", body);
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Nowy pomiar" onClose={onClose}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(([k, label, unit]) => (
            <Field
              key={k}
              label={`${label} (${unit})`}
              inputMode="decimal"
              value={values[k] ?? ""}
              placeholder={last?.[k] != null ? String(last[k]) : "–"}
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
            />
          ))}
        </div>
        <p className="text-sm text-muted">Wpisz tylko to, co mierzysz. Najlepiej rano, na czczo, w tym samym miejscu taśmy.</p>
        <ErrorText>{error}</ErrorText>
        <Button onClick={() => void save()} disabled={busy || !Object.values(values).some((v) => v.trim())}>
          {busy ? "zapisywanie…" : "✓ Zapisz pomiar"}
        </Button>
      </div>
    </Sheet>
  );
}

function Measurements({ items, onChange }: { items: Measurement[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const latest = items[0];
  // Zmiana względem poprzedniego pomiaru, w którym dana wartość była wpisana.
  const delta = (k: keyof Measurement) => {
    const now = latest?.[k] as number | null;
    const prev = items.slice(1).find((m) => m[k] != null)?.[k] as number | null | undefined;
    return now != null && prev != null ? now - prev : null;
  };

  return (
    <section className="grid gap-2">
      <SectionTitle
        right={
          <button onClick={() => setAdding(true)} className="font-mono text-[12px] font-semibold text-accent">
            + pomiar
          </button>
        }
      >
        Pomiary {latest && <span className="normal-case tracking-normal">· {shortDate(latest.measured_at)}</span>}
      </SectionTitle>
      {!latest ? (
        <button onClick={() => setAdding(true)} className="card min-h-14 border-dashed font-mono font-semibold text-accent">
          + Dodaj pierwszy pomiar
        </button>
      ) : (
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
          {FIELDS.filter(([k]) => latest[k] != null).map(([k, label, unit]) => {
            const d = delta(k);
            return (
              <div key={k} className="card grid gap-0.5 p-3">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
                <span className="num text-[20px] leading-tight font-bold">
                  {kg(latest[k] as number)}
                  <span className="ml-0.5 text-[12px] font-normal text-muted">{unit}</span>
                </span>
                {d != null && d !== 0 && (
                  <span className={`num text-[12px] font-semibold ${d > 0 ? "text-amber" : "text-accent"}`}>
                    {d > 0 ? "+" : ""}
                    {kg(d)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {items.length > 1 && (
        <details className="card px-4 py-2">
          <summary className="min-h-10 cursor-pointer content-center font-mono text-[13px] text-muted">historia pomiarów ({items.length})</summary>
          <ul className="grid">
            {items.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 border-t border-line/60 py-2 text-[14px]">
                <span className="num text-muted">{shortDate(m.measured_at)}</span>
                <span className="num min-w-0 flex-1 truncate text-right">
                  {FIELDS.filter(([k]) => m[k] != null)
                    .map(([k, label, unit]) => `${label.toLowerCase()} ${kg(m[k] as number)}${unit === "%" ? "%" : ""}`)
                    .join(" · ")}
                </span>
                <button
                  onClick={() => confirm("Usunąć ten pomiar?") && void api.del(`/body/measurements/${m.id}`).then(onChange)}
                  className="grid size-9 shrink-0 place-items-center text-muted"
                  aria-label="Usuń pomiar"
                >
                  <IconTrash size={16} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {adding && <AddMeasurement last={latest} onClose={() => setAdding(false)} onSaved={onChange} />}
    </section>
  );
}

export function Body() {
  const { data, error, reload } = useLoad(() => cachedGet<BodyData>("/body"), []);
  const [pose, setPose] = useState<Pose>("front");
  const [busy, setBusy] = useState(false);
  const [upError, setUpError] = useState<string | null>(null);
  // Hooki przed wczesnymi return, inaczej React wywraca ekran po załadowaniu danych.
  const picker = usePhotoPicker((f) => void upload(f), "user");

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Loading />;
  if (!data.consent) return <Consent onDone={() => void reload()} />;

  const reminder = data.reminders.find((r) => r.pose === pose);
  const ofPose = data.photos.filter((p) => p.pose === pose);

  async function upload(f: File) {
    setBusy(true);
    setUpError(null);
    try {
      await api.upload(`/body/photos?pose=${pose}`, await shrinkImage(f, 2048));
      toast({ tone: "info", title: "Zdjęcie zapisane", body: `Poza: ${POSE_NAME[pose]}. Następne za 4 tygodnie.` });
      await reload();
    } catch (e) {
      setUpError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProgressPhoto) {
    try {
      await api.del(`/body/photos/${p.id}`);
      await reload();
    } catch (e) {
      setUpError(errorText(e));
    }
  }

  const due = data.reminders.filter((r) => r.due && r.last_taken);

  return (
    <div className="grid gap-4">
      {due.length > 0 && (
        <BitSays mood="lift" size={60}>
          Minęły 4 tygodnie. Pora na nowe zdjęcie: <b className="text-accent">{due.map((r) => POSE_NAME[r.pose]).join(", ")}</b>.
        </BitSays>
      )}

      <section className="grid gap-2">
        <SectionTitle>Zdjęcia</SectionTitle>
        <Segmented value={pose as "front" | "side" | "back"} options={POSES} onChange={setPose} full />
        {ofPose.length > 0 ? (
          <PhotoLab key={pose} photos={ofPose} measurements={data.measurements} onDelete={remove} />
        ) : (
          <Card className="text-center text-[15px] text-muted">Zrób pierwsze zdjęcie w tej pozie. Za kilka tygodni drugie, a pokażę przed/po.</Card>
        )}
        {picker.inputs}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button onClick={picker.openCamera} disabled={busy} variant={reminder?.due ? "primary" : "outline"}>
            <IconCamera size={20} /> {busy ? "wysyłanie…" : `Zrób zdjęcie: ${POSE_NAME[pose]}`}
          </Button>
          <Button onClick={picker.openGallery} disabled={busy} variant="outline" aria-label="Wybierz z galerii">
            🖼️ Galeria
          </Button>
        </div>
        {reminder?.days_since != null && <p className="text-center font-mono text-[12px] text-muted">ostatnie {reminder.days_since === 0 ? "dziś" : `${reminder.days_since} dni temu`}</p>}
        <ErrorText>{upError}</ErrorText>
      </section>

      <Measurements items={data.measurements} onChange={() => void reload()} />

    </div>
  );
}
