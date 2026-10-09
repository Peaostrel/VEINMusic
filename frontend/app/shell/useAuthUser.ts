"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/app/lib/api";
import { isValidUser, setProfileTheme } from "@/app/lib/theme";
import {
  applyAppearance,
  mergePreferences,
  storePreferences,
  storedPreferences,
} from "@/app/lib/preferences";
import { clearOfflineCache } from "@/app/lib/offline";
import type { NavUser } from "./types";

/** Mirrors the signed-in state onto <html data-auth> for the shell CSS. */
export function syncAuthFlag(signedIn: boolean) {
  if (typeof document === "undefined") return;
  if (signedIn) document.documentElement.dataset.auth = "1";
  else delete document.documentElement.dataset.auth;
}

/**
 * Keep the stored preferences in step with the server. The public profile
 * carries only their public part, so the owner's full set (feed, goals,
 * listening…) comes from its own endpoint; if that fails, the public part is
 * laid over what is stored instead of wiping the private sections.
 */
function syncPreferences(publicPart: NavUser["preferences"]) {
  fetch(`${API_URL}/api/profile/preferences`, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((full) => {
      if (full) storePreferences(mergePreferences(full));
      else if (publicPart)
        storePreferences(
          mergePreferences({ ...storedPreferences(), ...publicPart }),
        );
    });
}

/**
 * Signed-in username (from localStorage) and profile (from the API).
 * Re-reads on navigation and on the "profile_update" event.
 */
export function useAuthUser(pathname: string | null) {
  const [username, setUsername] = useState<string | null>(null);
  const [profile, setProfile] = useState<NavUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("username");
    const name = isValidUser(stored) ? stored : null;
    setUsername(name);
    setReady(true);
    syncAuthFlag(Boolean(name));
  }, [pathname]);

  useEffect(() => {
    if (!username) {
      setProfile(null);
      return;
    }
    const load = () => {
      fetch(`${API_URL}/api/user/${encodeURIComponent(username)}`, {
        credentials: "include",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: NavUser | null) => {
          if (!data) return;
          setProfile(data);
          syncPreferences(data.preferences);
          // Apply the saved theme on first load only; don't override a theme
          // picked during this session.
          if (data.theme && !localStorage.getItem("site_theme")) {
            localStorage.setItem("site_theme", data.theme);
            globalThis.dispatchEvent(new Event("theme_update"));
          }
        })
        .catch(() => {});
    };
    load();
    globalThis.addEventListener("profile_update", load);
    return () => globalThis.removeEventListener("profile_update", load);
  }, [username]);

  useEffect(() => {
    const media = globalThis.matchMedia("(prefers-color-scheme: light)");
    const update = () => applyAppearance(storedPreferences().appearance);
    update();
    media.addEventListener("change", update);
    globalThis.addEventListener("preferences_update", update);
    return () => {
      media.removeEventListener("change", update);
      globalThis.removeEventListener("preferences_update", update);
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout failed:", e);
    }
    localStorage.removeItem("username");
    globalThis.postMessage(
      { type: "VEIN_EXTENSION_LOGOUT" },
      globalThis.location.origin,
    );
    localStorage.setItem("site_theme", "classic");
    localStorage.removeItem("vein_preferences");
    clearOfflineCache();
    applyAppearance(mergePreferences().appearance);
    syncAuthFlag(false);
    setUsername(null);
    setProfile(null);
    setProfileTheme(undefined);
    // Full reload on purpose: drops all client state of the old session
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    globalThis.location.href = "/auth";
  }, []);

  return { username, profile, ready, logout };
}

/** true / false once known, null before the first client render. */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = globalThis.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}
