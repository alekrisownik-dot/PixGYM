/**
 * Klient API. Logowanie trzymają ciasteczka HttpOnly (JS nie widzi tokenów).
 * Każda zmiana wysyła nagłówek CSRF skopiowany z ciasteczka pixgym_csrf.
 * Po 401 próbujemy raz odświeżyć sesję; jeśli się nie da, aplikacja wraca do logowania.
 */

import type { DayIcon } from "./ui/muscles";

export interface Me {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "admin";
  sex: "male" | "female" | null;
  birth_year: number | null;
  leaderboard_visible: boolean;
}

export type Tracking = "weight_reps" | "bodyweight_reps" | "duration" | "distance";
export type SetType = "warmup" | "working" | "drop" | "failure" | "amrap";

export interface ExercisePhoto {
  id: string;
  caption: string | null;
}

export interface Exercise {
  id: string;
  slug: string | null;
  name: string;
  tracking: Tracking;
  is_unilateral: boolean;
  equipment: string;
  custom: boolean;
  notes: string | null;
  /** Ciężar wpisywany na jedną stronę / rękę (w seriach zapisany łącznie, ×2). */
  per_side: boolean;
  /** Partia główna (slug), np. „chest”. */
  muscle: string | null;
  photos: ExercisePhoto[];
}

export interface Settings {
  default_rest_s: number;
  bar_weight_kg: number;
  plate_inventory: Record<string, number>;
}

export interface CalendarDay {
  date: string;
  sessions: number;
  sets: number;
  tonnage_kg: number;
}

export interface CalendarData {
  days: CalendarDay[];
  week_streak: number;
  total_days: number;
}

export interface MuscleVolume {
  muscle: string;
  name: string;
  hard_sets: number;
  tonnage_kg: number;
}

export interface Summary {
  id: string;
  local_date: string;
  duration_s: number;
  sets: number;
  reps: number;
  tonnage_kg: number;
  exercises: { exercise_id: string; name: string; sets: number; tonnage_kg: number; best_e1rm_kg: number | null }[];
  records: { name: string; record_type: SetRecord["record_type"]; reps: number | null; value: number }[];
  previous_date: string | null;
  previous_tonnage_kg: number | null;
}

export interface WorkoutSet {
  id: string;
  session_exercise_id: string;
  set_index: number;
  set_type: SetType;
  side: "both" | "left" | "right";
  weight_kg: number | null;
  added_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  rpe: number | null;
  rir: number | null;
  completed_at: string | null;
  effective_kg: number | null;
  e1rm_kg: number | null;
}

export interface SetRecord {
  record_type: "one_rm" | "e1rm" | "rep_max" | "set_volume" | "bodyweight_reps";
  reps: number | null;
  value: number;
  beat_previous: boolean;
}

export interface SavedSet extends WorkoutSet {
  records: SetRecord[];
}

export interface Block {
  exercise_id: string;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null; // null przy rep_min = AMRAP
  target_rpe: number | null;
  rest_s: number | null;
  superset_group: number | null;
  set_scheme: { pct?: number; reps: number; amrap?: boolean; tm_of?: string }[] | null;
  progression_rule_id: string | null;
  notes: string | null;
}

export interface PlanBlock extends Block {
  id?: string;
  name: string;
  tracking: Tracking;
}

export interface PlanDay {
  id?: string;
  day_index?: number;
  name: string;
  weekdays: number[];
  /** Ikonka na kole planu; null = dobierana z ćwiczeń. */
  icon?: DayIcon | null;
  blocks: PlanBlock[];
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  split: string;
  schedule: Schedule;
  builtin: boolean;
  version_id: string;
  version_no: number;
  active: boolean;
  days: PlanDay[];
}

/** weekdays: stałe dni tygodnia; flexible: dni po kolei, w dowolne dni tygodnia. */
export type Schedule = "weekdays" | "flexible";

/** Zaliczone dni planu w tygodniu i ostatnio zrobiony dzień. */
export interface PlanProgress {
  last_day_index: number | null;
  done: { day_index: number; local_date: string; session_id: string }[];
}

export interface PlanListItem {
  id: string;
  name: string;
  description: string | null;
  split: string;
  schedule: Schedule;
  builtin: boolean;
  days: number;
  active: boolean;
}

export interface SessionExercise {
  id: string;
  exercise_id: string;
  position: number;
  notes: string | null;
  name: string;
  tracking: Tracking;
  sets: WorkoutSet[];
  target?: Block | null;
}

export interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  bodyweight_kg: number | null;
  notes: string | null;
  program_day_id?: string | null;
  day_name?: string | null;
  exercises: SessionExercise[];
}

export interface SessionListItem {
  id: string;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  exercise_count: number;
  set_count: number;
  tonnage_kg: number;
}

export interface LastPerformance {
  date: string;
  sets: WorkoutSet[];
}

export interface TrainedExercise {
  id: string;
  name: string;
  tracking: Tracking;
  last_date: string;
  sessions: number;
  e1rm_kg: number | null;
}

export interface ExerciseRecord {
  record_type: SetRecord["record_type"];
  reps: number | null;
  value: number;
  achieved_at: string;
}

export interface Rank {
  lift: string;
  name: string;
  tier: number | null;
  title: string | null;
  ratio: number | null;
  next_title: string | null;
  next_at_kg: number | null;
  progress: number | null;
}

export interface LeaderboardRow {
  position: number;
  display_name: string;
  value: number;
  e1rm_kg: number;
  title: string | null;
  is_me: boolean;
}

export interface Badge {
  slug: string;
  title: string;
  description: string;
  earned_at: string | null;
  progress: number;
}

/** Brak sieci albo serwer nieosiągalny (np. Tailscale wyłączony). */
export class NetworkError extends Error {}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

let onLoggedOut: () => void = () => {};
export function setLoggedOutHandler(fn: () => void) {
  onLoggedOut = fn;
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)pixgym_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  // Kilka zapytań naraz może dostać 401; odświeżamy tylko raz.
  refreshing ??= fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "x-csrf-token": csrfToken() },
  })
    .then(
      (r) => r.ok,
      () => {
        throw new NetworkError("offline");
      },
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function ensureCsrf() {
  if (!csrfToken()) await fetch("/api/v1/health");
}

async function send(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new NetworkError("offline");
  }
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  if (method !== "GET") {
    try {
      await ensureCsrf();
    } catch {
      throw new NetworkError("offline");
    }
  }
  const raw = body instanceof Blob;
  const res = await send(`/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": raw ? body.type || "application/octet-stream" : "application/json" } : {}),
      ...(method !== "GET" ? { "x-csrf-token": csrfToken() } : {}),
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return request<T>(method, path, body, false);
    onLoggedOut();
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* brak JSON */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  request,
  get: <T>(path: string) => request<T>("GET", path),
  upload: <T>(path: string, file: Blob) => request<T>("POST", path, file),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: (path: string) => request<void>("DELETE", path),
};

/** UUIDv7 (jak na serwerze): ID nadaje telefon, więc ponowne wysłanie nie dubluje rekordu. */
export function uuid7(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const ms = Date.now();
  for (let i = 0; i < 6; i++) b[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const ERRORS: Record<string, string> = {
  invalid_credentials: "Zły e-mail albo hasło.",
  too_many_attempts: "Za dużo prób. Odczekaj minutę.",
  invalid_invite: "Kod zaproszenia jest zły, wygasł albo został już użyty.",
  email_taken: "Ten e-mail ma już konto.",
  csrf: "Odśwież stronę i spróbuj jeszcze raz.",
};

export function errorText(e: unknown): string {
  if (e instanceof NetworkError) return "Brak połączenia z serwerem (sprawdź Tailscale).";
  if (e instanceof ApiError) {
    if (ERRORS[e.detail]) return ERRORS[e.detail]!;
    if (e.status === 422) return "Sprawdź pola formularza.";
    if (e.status === 400 && e.detail) return e.detail;
    return `Błąd serwera (${e.status}).`;
  }
  return "Brak połączenia z serwerem.";
}

export type EventKind = "workout" | "event" | "competition" | "trip" | "health" | "rest";

/** Własne wydarzenie w kalendarzu (zawody, wyjazd, badanie…). */
export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  kind: EventKind;
  note: string | null;
}

export type Pose = "front" | "side" | "back" | "other";

export interface Measurement {
  id: string;
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  hip_cm: number | null;
  notes: string | null;
}

export interface ProgressPhoto {
  id: string;
  pose: Pose;
  taken_at: string;
  notes: string | null;
}

/** Moduł sylwetki: zgoda, pomiary, zdjęcia i przypomnienia (co 4 tygodnie na pozę). */
export interface BodyData {
  consent: boolean;
  measurements: Measurement[];
  photos: ProgressPhoto[];
  reminders: { pose: Pose; last_taken: string | null; days_since: number | null; due: boolean }[];
}

export interface PhotoPair {
  before_id: string;
  after_id: string;
  days_between: number;
}
