/**
 * Powiadomienia push: zgoda, subskrypcja w przeglądarce i rejestracja na serwerze.
 * Serwer sam wysyła przypomnienia o jutrze (też przy zamkniętej aplikacji), a service worker
 * je pokazuje (public/sw.js).
 */

import { api } from "../api";

export type PushState = "unsupported" | "denied" | "off" | "on";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!pushSupported()) return undefined;
  return (await navigator.serviceWorker.getRegistration()) ?? undefined;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Prosi o zgodę, zapisuje subskrypcję i wysyła ją na serwer. Zwraca nowy stan. */
export async function enablePush(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission === "denied" ? "denied" : "off";
  const { key } = await api.get<{ key: string }>("/push/key");
  let sub = await reg.pushManager.getSubscription();
  // Inny klucz serwera (np. nowy .env): stara subskrypcja jest bezużyteczna.
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(key)))) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const json = sub.toJSON();
  await api.post("/push/subscriptions", { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

/** Próbne powiadomienie od Bita na ten telefon. */
export async function testPush(): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) await api.post("/push/test", { endpoint: sub.endpoint });
}
