"use client";

import { useEffect, useState } from "react";

/** Accent presets. Muted on purpose: the UI is neutral, the accent is the
 * only colour, so it must stay readable on #0E0F10 without glowing. */
export const THEMES = {
  classic: {
    main: "#e3a93b",
    hover: "#eab55a",
    glow: "rgba(227,169,59,0.15)",
    glowStrong: "rgba(227,169,59,0.3)",
  },
  green: {
    main: "#5fb58e",
    hover: "#74c29f",
    glow: "rgba(95,181,142,0.15)",
    glowStrong: "rgba(95,181,142,0.3)",
  },
  orange: {
    main: "#e07a45",
    hover: "#e68f60",
    glow: "rgba(224,122,69,0.15)",
    glowStrong: "rgba(224,122,69,0.3)",
  },
  purple: {
    main: "#9d86e6",
    hover: "#ae9aeb",
    glow: "rgba(157,134,230,0.15)",
    glowStrong: "rgba(157,134,230,0.3)",
  },
  red: {
    main: "#e06c6c",
    hover: "#e68585",
    glow: "rgba(224,108,108,0.15)",
    glowStrong: "rgba(224,108,108,0.3)",
  },
  cyan: {
    main: "#56b6c2",
    hover: "#6fc3cd",
    glow: "rgba(86,182,194,0.15)",
    glowStrong: "rgba(86,182,194,0.3)",
  },
};

/** The profile page overrides the site theme through this global. */
type ThemeGlobal = typeof globalThis & { __ACTIVE_PROFILE_THEME__?: string };

export function getProfileTheme(): string | undefined {
  return (globalThis as ThemeGlobal).__ACTIVE_PROFILE_THEME__;
}

export function setProfileTheme(theme: string | undefined) {
  if (theme) (globalThis as ThemeGlobal).__ACTIVE_PROFILE_THEME__ = theme;
  else delete (globalThis as ThemeGlobal).__ACTIVE_PROFILE_THEME__;
  globalThis.dispatchEvent(new Event("theme_update"));
}

/** Username in localStorage, ignoring junk values left by old builds. */
export const isValidUser = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  const s = u.trim().toLowerCase();
  return !["", "null", "undefined", "false", "[]", "{}"].includes(s);
};

const hexToRgbVals = (hex: string) => {
  hex = hex.replace("#", "");
  if (hex.length === 3)
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: Number.parseInt(hex.substring(0, 2), 16) || 0,
    g: Number.parseInt(hex.substring(2, 4), 16) || 0,
    b: Number.parseInt(hex.substring(4, 6), 16) || 0,
  };
};

const presetTheme = (key: string) =>
  THEMES[key as keyof typeof THEMES] || THEMES.classic;

export const applyTheme = (themeKey: string) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isRainbow = themeKey === "rainbow";
  const isCustom = themeKey?.startsWith("#");
  let rgb = { r: 0, g: 0, b: 0 };
  if (!isRainbow)
    rgb = hexToRgbVals(isCustom ? themeKey : presetTheme(themeKey).main);
  const { r, g, b } = rgb;

  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  const textOnAccent = lum < 120 ? "#ffffff" : "#121212";
  const accentText = lum < 60 && !isRainbow ? "#ffffff" : "var(--accent)";
  root.style.setProperty("--text-on-accent", textOnAccent);
  root.style.setProperty("--accent-text", accentText);

  if (isRainbow) {
    root.classList.add("theme-rainbow");
    // Starting values so var(--accent) is never undefined; the interval in
    // useSiteTheme takes over in 40ms with the animation.
    root.style.setProperty("--accent", "#ff0044");
    root.style.setProperty("--accent-hover", "#ff0044");
    root.style.setProperty("--accent-glow", "rgba(255, 0, 68, 0.3)");
    root.style.setProperty("--accent-glow-strong", "rgba(255, 0, 68, 0.6)");
    return;
  }
  root.classList.remove("theme-rainbow");
  if (isCustom) {
    root.style.setProperty("--accent", themeKey);
    root.style.setProperty("--accent-hover", themeKey);
    root.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.3)`);
    root.style.setProperty(
      "--accent-glow-strong",
      `rgba(${r}, ${g}, ${b}, 0.6)`,
    );
  } else {
    const t = presetTheme(themeKey);
    root.style.setProperty("--accent", t.main);
    root.style.setProperty("--accent-hover", t.hover);
    root.style.setProperty("--accent-glow", t.glow);
    root.style.setProperty("--accent-glow-strong", t.glowStrong);
  }
};

function currentThemeKey(): string {
  const path = globalThis.location.pathname.toLowerCase();
  if (path.includes("/auth")) return "classic";
  const profileTheme = getProfileTheme();
  if (path.startsWith("/user/") && profileTheme) return profileTheme;
  if (isValidUser(localStorage.getItem("username")))
    return localStorage.getItem("site_theme") || "classic";
  return "classic";
}

/**
 * Applies the site theme (the viewed profile's theme on /user pages) and
 * re-applies it on the "theme_update" event; animates the rainbow theme.
 */
export function useSiteTheme(pathname: string | null) {
  const [currentTheme, setCurrentTheme] = useState("classic");

  useEffect(() => {
    const handleThemeUpdate = () => {
      const t = currentThemeKey();
      setCurrentTheme(t);
      applyTheme(t);
    };
    handleThemeUpdate();
    globalThis.addEventListener("theme_update", handleThemeUpdate);
    return () =>
      globalThis.removeEventListener("theme_update", handleThemeUpdate);
  }, [pathname]);

  useEffect(() => {
    if (currentTheme !== "rainbow") return;
    const root = document.documentElement;
    let hue = 0;
    const interval = setInterval(() => {
      hue = (hue + 2) % 360;
      root.style.setProperty("--accent", `hsl(${hue}, 65%, 62%)`);
      root.style.setProperty("--accent-hover", `hsl(${hue}, 65%, 62%)`);
      root.style.setProperty("--accent-glow", `hsla(${hue}, 100%, 100%, 0.3)`);
      root.style.setProperty(
        "--accent-glow-strong",
        `hsla(${hue}, 100%, 100%, 0.6)`,
      );
      root.style.setProperty("--text-on-accent", "#121212");
    }, 40);
    return () => clearInterval(interval);
  }, [currentTheme]);
}
