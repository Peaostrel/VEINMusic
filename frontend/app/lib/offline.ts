/** Offline reading: the service worker keeps API answers (public/sw.js). */
import { API_URL } from "./api";

/** Must match API_CACHE in public/sw.js. */
const API_CACHE = "veinmusic-api-v1";

/** Script URL of the service worker; it needs to know where the API is. */
export const SERVICE_WORKER_URL = `/sw.js?api=${encodeURIComponent(API_URL)}`;

/** Forget saved API answers: another account must not see them. */
export function clearOfflineCache() {
  if (typeof caches === "undefined") return;
  caches.delete(API_CACHE).catch(() => {});
}
