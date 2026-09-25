import { apiFetch, apiJson } from "./api";
import type { VapidKeyResponse } from "./types";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushConfig(): Promise<VapidKeyResponse> {
  return apiJson<VapidKeyResponse>("/api/push/vapid-key");
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask for permission, subscribe the browser and register it on the server. */
export async function enablePush(): Promise<void> {
  const config = await getPushConfig();
  if (!config.enabled || !config.vapid_public_key) {
    throw new Error("Push-уведомления не настроены на сервере");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Браузер запретил уведомления");
  }
  const reg =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register("/sw.js"));
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.vapid_public_key),
  });
  const json = subscription.toJSON();
  await apiJson("/api/push/subscribe", {
    method: "POST",
    json: {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
  });
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await apiFetch("/api/push/unsubscribe", {
    method: "POST",
    json: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}
