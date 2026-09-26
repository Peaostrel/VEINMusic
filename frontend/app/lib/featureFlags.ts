"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/api";

/** Features an admin can switch off (see runtime_settings.KNOWN_FEATURES). */
export type Feature =
  "registration" | "listen_together" | "lastfm_import" | "webhooks";

type Flags = Record<string, boolean>;

let pending: Promise<Flags> | null = null;

function loadFlags(): Promise<Flags> {
  pending ??= fetch(`${API_URL}/api/feature-flags`)
    .then((res) => (res.ok ? res.json() : { flags: {} }))
    .then((data: { flags?: Flags }) => data.flags ?? {})
    .catch(() => {
      pending = null; // retry on the next mount
      return {};
    });
  return pending;
}

/** Whether a feature is on. Optimistically true until the flags load, and
 * when they can't be loaded: the server enforces the flag anyway. */
export function useFeature(feature: Feature): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let active = true;
    loadFlags().then((flags) => {
      if (active) setEnabled(flags[feature] ?? true);
    });
    return () => {
      active = false;
    };
  }, [feature]);
  return enabled;
}
