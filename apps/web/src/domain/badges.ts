/**
 * Odznaki, historia awansów rang i przypomnienia o zdjęciach. Lustro pixgym.domain.badges.
 * Liczone z danych na żądanie. Daty jako tekst YYYY-MM-DD w strefie użytkownika.
 */
import { RANKED_LIFTS, TITLES, rankFor, type Sex } from "./ranks";
import { weekStart } from "./volume";

const dayNumber = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86_400_000;
const days = (a: string, b: string) => dayNumber(b) - dayNumber(a);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Epsilon chroni przed 0.29 * 100 = 28.999…; identycznie w Pythonie. */
const floor2 = (x: number) => Math.floor(Math.min(1, x) * 100 + 1e-9) / 100;

// --- historia rang ---

export interface RankPoint {
  date: string;
  e1rm_kg: number;
  bodyweight_kg: number | null;
}
export interface RankEvent {
  tier: number;
  title: string;
  date: string;
  e1rm_kg: number;
}

/** Kiedy pierwszy raz zdobyto każdą rangę. Pierwszy wpis to ranga startowa; spadek nie odbiera rangi z historii. */
export function rankHistory(liftSlug: string, points: readonly RankPoint[], sex: Sex | null | undefined): RankEvent[] {
  // Jeden punkt na dzień: najlepszy wynik (bez dwóch awansów z tą samą datą).
  const byDay = new Map<string, RankPoint>();
  for (const p of points) {
    const prev = byDay.get(p.date);
    if (!prev || p.e1rm_kg > prev.e1rm_kg) byDay.set(p.date, p);
  }
  let best = -1;
  const out: RankEvent[] = [];
  for (const day of [...byDay.keys()].sort(cmp)) {
    const p = byDay.get(day)!;
    const rank = rankFor(liftSlug, p.e1rm_kg, p.bodyweight_kg, sex);
    if (rank && rank.tier > best) {
      best = rank.tier;
      out.push({ tier: rank.tier, title: rank.title, date: p.date, e1rm_kg: p.e1rm_kg });
    }
  }
  return out;
}

// --- odznaki ---

export interface BadgeDef {
  slug: string;
  title: string;
  description: string;
}

export const BADGES: readonly BadgeDef[] = [
  { slug: "first_blood", title: "First Blood", description: "Pierwszy trening" },
  { slug: "buffer_overflow", title: "Buffer Overflow", description: "Pierwszy pobity rekord" },
  { slug: "exploit_chain", title: "Exploit Chain", description: "5 serii z nowym rekordem na jednym treningu" },
  { slug: "brute_force", title: "Brute Force", description: "100 ciężkich serii w miesiącu" },
  { slug: "ddos", title: "DDoS", description: "20 ton w jednym tygodniu" },
  { slug: "uptime_30d", title: "Uptime 30d", description: "30 dni treningów bez przerwy dłuższej niż tydzień" },
  { slug: "uptime_180d", title: "Uptime 180d", description: "180 dni treningów bez przerwy dłuższej niż tydzień" },
  { slug: "privilege_escalation", title: "Privilege Escalation", description: "Pierwszy awans rangi" },
  { slug: "sudo", title: "sudo su", description: "Ranga Root Access w dowolnym boju" },
  { slug: "full_stack", title: "Full Stack", description: "Ranga Exploit Dev we wszystkich bojach rankingowych" },
  { slug: "snapshot", title: "Snapshot", description: "Pierwsze zdjęcie postępu" },
  { slug: "git_diff", title: "git diff", description: "Zdjęcia w tej samej pozie w odstępie 12 tygodni" },
  { slug: "stack_overflow", title: "Stack Overflow", description: "50 treningów" },
  { slug: "mainframe", title: "Mainframe", description: "100 treningów" },
  { slug: "overclock", title: "Overclock", description: "10 ton na jednym treningu" },
  { slug: "big_data", title: "Big Data", description: "100 ton łącznie" },
  { slug: "rootkit", title: "Rootkit", description: "25 pobitych rekordów" },
  { slug: "load_balancer", title: "Load Balancer", description: "4 tygodnie z rzędu po co najmniej 3 treningi" },
  { slug: "ctrl_z", title: "Ctrl+Z", description: "Powrót na salę po co najmniej 2 tygodniach przerwy" },
  { slug: "night_shift", title: "Night Shift", description: "Trening zaczęty po 22:00" },
  { slug: "cron_job", title: "Cron 06:00", description: "Trening zaczęty przed 7:00" },
  { slug: "weekend_deploy", title: "Weekend Deploy", description: "10 treningów w soboty i niedziele" },
];

export const BRUTE_FORCE_SETS = 100;
export const STACK_OVERFLOW_SESSIONS = 50;
export const MAINFRAME_SESSIONS = 100;
export const OVERCLOCK_KG = 10_000;
export const BIG_DATA_KG = 100_000;
export const ROOTKIT_RECORDS = 25;
export const LOAD_BALANCER_WEEKS = 4;
export const LOAD_BALANCER_PER_WEEK = 3;
export const CTRL_Z_GAP_DAYS = 14;
export const WEEKEND_SESSIONS = 10;
export const DDOS_TONNAGE_KG = 20_000;
export const MAX_GAP_DAYS = 7;
export const EXPLOIT_CHAIN_RECORDS = 5;
export const SUDO_TIER = TITLES.indexOf("Root Access");
export const FULL_STACK_TIER = TITLES.indexOf("Exploit Dev");
export const GIT_DIFF_DAYS = 84;

export interface BadgeSession {
  date: string;
  hard_sets: number;
  tonnage_kg: number;
  /** Lokalna godzina rozpoczęcia; bez niej odznaki za porę dnia się nie liczą. */
  hour?: number | null;
}
export interface Badge extends BadgeDef {
  earned_at: string | null;
  progress: number;
}
type Result = [earned: string | null, progress: number];

function thresholdInBuckets(
  sessions: readonly BadgeSession[],
  bucket: (d: string) => string,
  field: "hard_sets" | "tonnage_kg",
  target: number,
): Result {
  const totals = new Map<string, number>();
  let earned: string | null = null;
  for (const s of sessions) {
    const key = bucket(s.date);
    const total = (totals.get(key) ?? 0) + s[field];
    totals.set(key, total);
    if (earned === null && total >= target) earned = s.date;
  }
  return [earned, Math.max(0, ...totals.values()) / target];
}

function uptime(dates: readonly string[], target: number): Result {
  let earned: string | null = null;
  let start = "";
  let prev: string | null = null;
  let best = 0;
  for (const d of dates) {
    if (prev === null || days(prev, d) > MAX_GAP_DAYS) start = d;
    const span = days(start, d);
    best = Math.max(best, span);
    if (earned === null && span >= target) earned = d;
    prev = d;
  }
  return [earned, best / target];
}

/** Data n-tego zdarzenia (już posortowane) i postęp do n. */
function nth(dates: readonly string[], n: number): Result {
  return [dates.length >= n ? dates[n - 1]! : null, dates.length / n];
}

/** Kolejne tygodnie, w których jest co najmniej 3 treningi; data spełnienia 4. tygodnia. */
function loadBalancer(dates: readonly string[]): Result {
  const perWeek = new Map<string, string[]>();
  for (const d of dates) perWeek.set(weekStart(d), [...(perWeek.get(weekStart(d)) ?? []), d]);
  let earned: string | null = null;
  let streak = 0;
  let best = 0;
  let prev: string | null = null;
  for (const week of [...perWeek.keys()].sort(cmp)) {
    const inWeek = perWeek.get(week)!;
    if (inWeek.length < LOAD_BALANCER_PER_WEEK) {
      streak = 0;
      prev = null;
      continue;
    }
    streak = prev !== null && days(prev, week) === 7 ? streak + 1 : 1;
    prev = week;
    best = Math.max(best, streak);
    if (earned === null && streak >= LOAD_BALANCER_WEEKS) earned = inWeek[LOAD_BALANCER_PER_WEEK - 1]!;
  }
  return [earned, best / LOAD_BALANCER_WEEKS];
}

export function evaluateBadges(
  sessionsIn: readonly BadgeSession[],
  beatenRecords: readonly { date: string }[],
  rankEvents: Readonly<Record<string, readonly { tier: number; date: string }[]>>,
  photosIn: readonly { pose: string; date: string }[],
): Badge[] {
  const sessions = [...sessionsIn].sort((a, b) => cmp(a.date, b.date));
  const dates = [...new Set(sessions.map((s) => s.date))].sort(cmp);
  const beaten = beatenRecords.map((r) => r.date).sort(cmp);
  const photos = [...photosIn].sort((a, b) => cmp(a.date, b.date));
  const result: Record<string, Result> = {};

  result.first_blood = dates.length ? [dates[0]!, 1] : [null, 0];
  result.buffer_overflow = beaten.length ? [beaten[0]!, 1] : [null, 0];

  const perDay = new Map<string, number>();
  let chain: string | null = null;
  for (const d of beaten) {
    const n = (perDay.get(d) ?? 0) + 1;
    perDay.set(d, n);
    if (chain === null && n >= EXPLOIT_CHAIN_RECORDS) chain = d;
  }
  result.exploit_chain = [chain, Math.max(0, ...perDay.values()) / EXPLOIT_CHAIN_RECORDS];

  result.brute_force = thresholdInBuckets(sessions, (d) => d.slice(0, 7), "hard_sets", BRUTE_FORCE_SETS);
  result.ddos = thresholdInBuckets(sessions, weekStart, "tonnage_kg", DDOS_TONNAGE_KG);
  result.uptime_30d = uptime(dates, 30);
  result.uptime_180d = uptime(dates, 180);

  const lifts = Object.values(rankEvents);
  const promotions = lifts.flatMap((events) => events.slice(1).map((e) => e.date)).sort(cmp);
  result.privilege_escalation = promotions.length ? [promotions[0]!, 1] : [null, 0];

  const allEvents = lifts.flat().sort((a, b) => cmp(a.date, b.date));
  const sudo = allEvents.find((e) => e.tier >= SUDO_TIER)?.date ?? null;
  const top = Math.max(0, ...allEvents.map((e) => e.tier));
  result.sudo = [sudo, top / SUDO_TIER];

  const reached = Object.keys(RANKED_LIFTS)
    .map((lift) => (rankEvents[lift] ?? []).find((e) => e.tier >= FULL_STACK_TIER)?.date)
    .filter((d): d is string => d !== undefined);
  const liftCount = Object.keys(RANKED_LIFTS).length;
  result.full_stack = [reached.length === liftCount ? reached.sort(cmp)[liftCount - 1]! : null, reached.length / liftCount];

  result.snapshot = photos.length ? [photos[0]!.date, 1] : [null, 0];

  const firstByPose = new Map<string, string>();
  let diff: string | null = null;
  let bestSpan = 0;
  for (const p of photos) {
    if (!firstByPose.has(p.pose)) firstByPose.set(p.pose, p.date);
    const span = days(firstByPose.get(p.pose)!, p.date);
    bestSpan = Math.max(bestSpan, span);
    if (diff === null && span >= GIT_DIFF_DAYS) diff = p.date;
  }
  result.git_diff = [diff, bestSpan / GIT_DIFF_DAYS];

  // Kolejne treningi (także kilka jednego dnia), w kolejności dnia i godziny.
  const ordered = [...sessions].sort((a, b) => cmp(a.date, b.date) || (a.hour ?? 0) - (b.hour ?? 0));
  const sessionDates = ordered.map((s) => s.date);
  result.stack_overflow = nth(sessionDates, STACK_OVERFLOW_SESSIONS);
  result.mainframe = nth(sessionDates, MAINFRAME_SESSIONS);

  const heavy = ordered.find((s) => s.tonnage_kg >= OVERCLOCK_KG)?.date ?? null;
  result.overclock = [heavy, Math.max(0, ...ordered.map((s) => s.tonnage_kg)) / OVERCLOCK_KG];

  let total = 0;
  let big: string | null = null;
  for (const s of ordered) {
    total += s.tonnage_kg;
    if (big === null && total >= BIG_DATA_KG) big = s.date;
  }
  result.big_data = [big, total / BIG_DATA_KG];

  result.rootkit = nth(beaten, ROOTKIT_RECORDS);
  result.load_balancer = loadBalancer(sessionDates);

  const gaps = dates.slice(1).map((d, i) => [days(dates[i]!, d), d] as const);
  const back = gaps.find(([gap]) => gap >= CTRL_Z_GAP_DAYS)?.[1] ?? null;
  result.ctrl_z = [back, Math.max(0, ...gaps.map(([gap]) => gap)) / CTRL_Z_GAP_DAYS];

  const firstAt = (test: (h: number) => boolean): Result => {
    const d = ordered.find((s) => s.hour != null && test(s.hour))?.date ?? null;
    return [d, d ? 1 : 0];
  };
  result.night_shift = firstAt((h) => h >= 22 || h < 4);
  result.cron_job = firstAt((h) => h >= 4 && h < 7);

  // Sobota i niedziela: dzień tygodnia z daty w UTC (daty są lokalne, bez strefy).
  const weekend = sessionDates.filter((d) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
  result.weekend_deploy = nth(weekend, WEEKEND_SESSIONS);

  return BADGES.map((b) => {
    const [earned, progress] = result[b.slug]!;
    return { ...b, earned_at: earned, progress: earned ? 1 : floor2(progress) };
  });
}

// --- zdjęcia ---

export const POSES = ["front", "side", "back"] as const;
export const PHOTO_INTERVAL_DAYS = 28;

export interface PhotoReminder {
  pose: string;
  last_taken: string | null;
  days_since: number | null;
  due: boolean;
}

/** Dla każdej pozy: czy pora na nowe zdjęcie (brak albo ostatnie sprzed intervalDays). */
export function photoReminders(
  photos: readonly { pose: string; date: string }[],
  today: string,
  intervalDays = PHOTO_INTERVAL_DAYS,
): PhotoReminder[] {
  const last = new Map<string, string>();
  for (const p of photos) {
    if ((POSES as readonly string[]).includes(p.pose) && p.date > (last.get(p.pose) ?? "")) last.set(p.pose, p.date);
  }
  return POSES.map((pose) => {
    const taken = last.get(pose) ?? null;
    const since = taken ? days(taken, today) : null;
    return { pose, last_taken: taken, days_since: since, due: since === null || since >= intervalDays };
  });
}

export interface PhotoRef {
  id: string;
  pose: string;
  date: string;
}
export interface PhotoPair {
  before_id: string;
  after_id: string;
  days_between: number;
}

/** Para przed/po w jednej pozie: najbliższe podanym datom, domyślnie pierwsze i ostatnie. */
export function comparePair(photos: readonly PhotoRef[], pose: string, before?: string | null, after?: string | null): PhotoPair | null {
  const byDateId = (a: PhotoRef, b: PhotoRef) => cmp(a.date, b.date) || cmp(a.id, b.id);
  const same = photos.filter((p) => p.pose === pose).sort(byDateId);
  if (same.length < 2) return null;
  const nearest = (day: string) =>
    same.reduce((best, p) => {
      const d = Math.abs(days(day, p.date)) - Math.abs(days(day, best.date));
      return d < 0 || (d === 0 && byDateId(p, best) < 0) ? p : best;
    });
  let a = before ? nearest(before) : same[0]!;
  let b = after ? nearest(after) : same[same.length - 1]!;
  if (a.id === b.id) return null;
  if (byDateId(a, b) > 0) [a, b] = [b, a];
  return { before_id: a.id, after_id: b.id, days_between: days(a.date, b.date) };
}
