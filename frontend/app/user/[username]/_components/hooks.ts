"use client";

import { useState, useEffect } from "react";
import { setProfileTheme } from "@/app/lib/theme";

export function useProfileTheme(theme: string | undefined) {
  useEffect(() => {
    if (theme) setProfileTheme(theme);
    return () => setProfileTheme(undefined);
  }, [theme]);
}

/** Current time, refreshed every `intervalMs` (null until mounted). */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
