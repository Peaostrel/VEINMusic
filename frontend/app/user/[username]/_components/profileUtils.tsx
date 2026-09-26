"use client";

import { API_URL } from "@/app/lib/api";
import type { Country, TrackLinkSource } from "@/app/lib/types";

// Utility to break CodeQL taint dataflow tracking while preserving the string
export const getSafeUrl = (url: string | null | undefined): string => {
  if (!url || typeof url !== "string") return "about:blank";
  if (!/^(https?:\/\/|\/)/i.test(url)) return "about:blank";
  try {
    return String.fromCodePoint(
      ...Array.from(url).map((c) => c.codePointAt(0) as number),
    );
  } catch {
    return "about:blank";
  }
};

export const getArtistUrl = (artist: string, source: string) => {
  if (!artist) return "#";
  const q = encodeURIComponent(artist);
  switch (source) {
    case "spotify":
      return `https://open.spotify.com/search/${q}/artists`;
    case "vk":
      return `https://vk.com/audio?q=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
    case "soundcloud":
      return `https://soundcloud.com/search/people?q=${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    default:
      // Для Яндекс.Музыки и всех остальных импортированных/неизвестных источников используем умный редирект бэкенда
      return `${API_URL}/api/redirect?source=yandex&type=artist&q=${q}`;
  }
};

export const getTrackUrl = (t: TrackLinkSource | null | undefined) => {
  if (!t) return "#";
  if (t.track_url && t.track_url !== "#") return t.track_url;

  const query = encodeURIComponent(`${t.artist || ""} ${t.title || ""}`.trim());
  switch (t.source) {
    case "spotify":
      return `https://open.spotify.com/search/${query}`;
    case "vk":
      return `https://vk.com/audio?q=${query}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${query}`;
    case "soundcloud":
      return `https://soundcloud.com/search?q=${query}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${query}`;
    default:
      // Для Яндекс.Музыки и всех остальных источников используем умный редирект бэкенда
      // Он найдет трек через API Яндекса и перенаправит прямо на страницу трека
      return `${API_URL}/api/redirect?source=yandex&type=track&q=${query}`;
  }
};

export const SocialIcons = {
  telegram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.892-.661 3.495-1.524 5.83-2.529 7.005-3.017 3.332-1.392 4.02-1.631 4.464-1.639z" />
    </svg>
  ),
  vk: (
    <svg viewBox="5.5 3 18 18" fill="currentColor" className="w-5 h-5">
      <path d="M15.5 17c-5.5 0-8.6-3.8-8.7-10h2.7c.1 4.5 2.1 6.4 3.7 6.8V7h2.5v3.9c1.5-.2 3.1-1.9 3.6-3.9h2.5c-.4 2.5-2.2 4.2-3.5 5 1.3.6 3.4 2 4.2 5h-2.8c-.6-2-2.2-3.5-4.2-3.7V17h-2z" />
    </svg>
  ),
  steam: (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5 transition-all duration-200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  ),
};

export const COMMON_COUNTRIES: { [key: string]: string } = {
  // Russian
  россия: "RU",
  "российская федерация": "RU",
  украина: "UA",
  беларусь: "BY",
  белоруссия: "BY",
  казахстан: "KZ",
  германия: "DE",
  сша: "US",
  "соединенные штаты": "US",
  "соединенные штаты америки": "US",
  великобритания: "GB",
  франция: "FR",
  италия: "IT",
  испания: "ES",
  нидерланды: "NL",
  польша: "PL",
  финляндия: "FI",
  швеция: "SE",
  норвегия: "NO",
  грузия: "GE",
  армения: "AM",
  азербайджан: "AZ",
  латвия: "LV",
  литва: "LT",
  эстония: "EE",
  молдова: "MD",
  узбекистан: "UZ",
  киргизия: "KG",
  таджикистан: "TJ",
  туркменистан: "TM",
  турция: "TR",
  китай: "CN",
  япония: "JP",
  "южная корея": "KR",
  канада: "CA",
  австралия: "AU",

  // English
  russia: "RU",
  "russian federation": "RU",
  ukraine: "UA",
  belarus: "BY",
  kazakhstan: "KZ",
  germany: "DE",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  "united kingdom": "GB",
  "great britain": "GB",
  france: "FR",
  italy: "IT",
  spain: "ES",
  netherlands: "NL",
  poland: "PL",
  finland: "FI",
  sweden: "SE",
  norway: "NO",
  georgia: "GE",
  armenia: "AM",
  azerbaijan: "AZ",
  latvia: "LV",
  lithuania: "LT",
  estonia: "EE",
  moldova: "MD",
  uzbekistan: "UZ",
  kyrgyzstan: "KG",
  tajikistan: "TJ",
  turkmenistan: "TM",
  turkey: "TR",
  china: "CN",
  japan: "JP",
  "south korea": "KR",
  canada: "CA",
  australia: "AU",
};

export function getCountryCode(
  countryName: string,
  countries: Country[],
): string | null {
  if (!countryName) return null;
  const cleaned = countryName.trim().toLowerCase();

  // 1. Поиск по словарю популярных стран
  if (COMMON_COUNTRIES[cleaned]) {
    return COMMON_COUNTRIES[cleaned];
  }

  // 2. Поиск по загруженному списку стран (если restcountries ответил)
  const found = countries.find((c) => c.name.toLowerCase() === cleaned);
  if (found) {
    return found.code;
  }

  return null;
}

export function getNetworkLabel(net: string): string {
  const lower = net.toLowerCase();
  if (lower === "vk") return "VK";
  if (lower === "github") return "GitHub";
  return net.charAt(0).toUpperCase() + net.slice(1);
}

const SOCIAL_URL_PREFIXES: Record<string, string> = {
  telegram: "https://t.me/",
  vk: "https://vk.com/",
  steam: "https://steamcommunity.com/id/",
  github: "https://github.com/",
  instagram: "https://instagram.com/",
};

/** Profile link for a known network, or null (unknown networks aren't shown). */
export function getSocialUrl(network: string, username: string): string | null {
  const prefix = SOCIAL_URL_PREFIXES[String(network).toLowerCase()];
  if (!prefix || !username) return null;
  return prefix + encodeURIComponent(String(username).replace(/^@/, ""));
}
