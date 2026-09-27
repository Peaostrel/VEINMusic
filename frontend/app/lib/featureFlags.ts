"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/api";

/** Features an admin can switch off (see runtime_settings.KNOWN_FEATURES). */
export type Feature =
  | "registration"
  | "listen_together"
  | "lastfm_import"
  | "webhooks"
  | "integration_yandex"
  | "integration_spotify"
  | "integration_lastfm";

type Flags = Record<string, boolean>;

let pending: Promise<Flags> | null = null;

function loadFlags(): Promise<Flags> {
  pending ??= fetch(`${API_URL}/api/feature-flags`, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : { flags: {} }))
    .then((data: { flags?: Flags }) => data.flags ?? {})
    .catch(() => ({}))
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Whether a feature is on. Optimistically true until the flags load, and
 * when they can't be loaded: the server enforces the flag anyway. */
export function useFeature(feature: Feature): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let active = true;
    const update = () => {
      loadFlags().then((flags) => {
        if (active) setEnabled(flags[feature] ?? true);
      });
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") update();
    };

    update();
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", updateWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, [feature]);
  return enabled;
}
