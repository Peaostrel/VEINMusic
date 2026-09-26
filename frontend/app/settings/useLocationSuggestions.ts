"use client";

import { useEffect, useState } from "react";
import type { Country } from "./types";

/** Shown until the full list from restcountries.com has loaded. */
export const LOCAL_COUNTRIES: Country[] = [
  { name: "Россия", code: "RU", flag: "🇷🇺" },
  { name: "Беларусь", code: "BY", flag: "🇧🇾" },
  { name: "Казахстан", code: "KZ", flag: "🇰🇿" },
  { name: "Украина", code: "UA", flag: "🇺🇦" },
  { name: "Германия", code: "DE", flag: "🇩🇪" },
  { name: "США", code: "US", flag: "🇺🇸" },
  { name: "Великобритания", code: "GB", flag: "🇬🇧" },
  { name: "Франция", code: "FR", flag: "🇫🇷" },
  { name: "Италия", code: "IT", flag: "🇮🇹" },
  { name: "Испания", code: "ES", flag: "🇪🇸" },
  { name: "Нидерланды", code: "NL", flag: "🇳🇱" },
  { name: "Польша", code: "PL", flag: "🇵🇱" },
  { name: "Финляндия", code: "FI", flag: "🇫🇮" },
  { name: "Швеция", code: "SE", flag: "🇸🇪" },
  { name: "Норвегия", code: "NO", flag: "🇳🇴" },
  { name: "Грузия", code: "GE", flag: "🇬🇪" },
  { name: "Армения", code: "AM", flag: "🇦🇲" },
  { name: "Азербайджан", code: "AZ", flag: "🇦🇿" },
  { name: "Латвия", code: "LV", flag: "🇱🇻" },
  { name: "Литва", code: "LT", flag: "🇱🇹" },
  { name: "Эстония", code: "EE", flag: "🇪🇪" },
  { name: "Молдова", code: "MD", flag: "🇲🇩" },
  { name: "Узбекистан", code: "UZ", flag: "🇺🇿" },
  { name: "Киргизия", code: "KG", flag: "🇰🇬" },
  { name: "Таджикистан", code: "TJ", flag: "🇹🇯" },
  { name: "Туркменистан", code: "TM", flag: "🇹🇲" },
  { name: "Турция", code: "TR", flag: "🇹🇷" },
  { name: "Китай", code: "CN", flag: "🇨🇳" },
  { name: "Япония", code: "JP", flag: "🇯🇵" },
  { name: "Южная Корея", code: "KR", flag: "🇰🇷" },
  { name: "Канада", code: "CA", flag: "🇨🇦" },
  { name: "Австралия", code: "AU", flag: "🇦🇺" },
];

interface RestCountry {
  name: { common: string };
  translations?: { rus?: { common?: string } };
  cca2: string;
  flag: string;
}

interface NominatimPlace {
  name?: string;
  importance?: number;
  address?: { city?: string; town?: string; village?: string };
}

function extractCityName(item: NominatimPlace): string {
  const addr = item.address || {};
  const name = addr.city || addr.town || addr.village || item.name || "";
  return name
    .split(",")[0]
    .replace(
      /(сельсовет|городское поселение|муниципальное образование|район|станция|платформа|парк)/gi,
      "",
    )
    .trim();
}

function matchesQuery(name: string, query: string): boolean {
  if (!name || name.length < 2) return false;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  return n.includes(q) || q.includes(n);
}

function processCities(places: NominatimPlace[], query: string): string[] {
  const sorted = [...places].toSorted(
    (a, b) => (b.importance || 0) - (a.importance || 0),
  );
  return Array.from(
    new Set(sorted.map(extractCityName).filter((n) => matchesQuery(n, query))),
  ).slice(0, 10);
}

function processCountries(raw: unknown): Country[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RestCountry[])
    .map((c) => ({
      name: c.translations?.rus?.common || c.name.common,
      code: c.cca2,
      flag: c.flag,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Country list and city suggestions for the location fields. */
export function useLocationSuggestions(country: string, city: string) {
  const [countries, setCountries] = useState<Country[]>(LOCAL_COUNTRIES);
  const [cities, setCities] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState("");

  useEffect(() => {
    fetch(
      "https://restcountries.com/v3.1/all?fields=name,translations,cca2,flag",
    )
      .then((r) => r.json())
      .then((d) => {
        const list = processCountries(d);
        if (list.length > 0) setCountries(list);
      })
      .catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    if (!country || countries.length === 0) return;
    const found = countries.find(
      (c) => c.name.toLowerCase().trim() === country.toLowerCase().trim(),
    );
    if (found) setCountryCode(found.code);
  }, [country, countries]);

  useEffect(() => {
    if (!countryCode || city.length < 2) {
      setCities([]);
      return;
    }
    let active = true;
    setCities([]);
    const delay = setTimeout(() => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&accept-language=ru&addressdetails=1&countrycodes=${countryCode.toLowerCase()}&limit=20`;
      fetch(url)
        .then((r) => r.json())
        .then((d) => {
          if (active && Array.isArray(d)) setCities(processCities(d, city));
        })
        .catch((error) => {
          console.error(error);
          if (active) setCities([]);
        });
    }, 500);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [city, countryCode]);

  return { countries, cities };
}
