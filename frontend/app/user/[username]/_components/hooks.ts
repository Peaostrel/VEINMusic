"use client";

import { useState, useEffect } from "react";
import { setProfileTheme } from "@/app/lib/theme";
import type { Country } from "@/app/lib/types";

interface RestCountry {
  name: { common: string };
  translations?: { rus?: { common?: string } };
  cca2: string;
  flag: string;
}

export function useCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  useEffect(() => {
    fetch(
      "https://restcountries.com/v3.1/all?fields=name,translations,cca2,flag",
    )
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          const list = d.map((c: RestCountry) => ({
            name: c.translations?.rus?.common || c.name.common,
            code: c.cca2,
            flag: c.flag,
          }));
          setCountries(list);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch countries", err);
      });
  }, []);
  return countries;
}

export function useProfileTheme(theme: string | undefined) {
  useEffect(() => {
    if (theme) setProfileTheme(theme);
    return () => setProfileTheme(undefined);
  }, [theme]);
}

export function useAccentColor(coverUrl: string | undefined) {
  const [accentColor, setAccentColor] = useState<string>("");
  useEffect(() => {
    if (!coverUrl) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = coverUrl;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 1;
      canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      setAccentColor(`rgb(${r}, ${g}, ${b})`);
    };
  }, [coverUrl]);
  return accentColor;
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
