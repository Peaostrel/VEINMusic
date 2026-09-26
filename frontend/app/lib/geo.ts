"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/api";
import type { Country } from "@/app/lib/types";

// Countries and cities come from the API (/api/geo/*), which queries
// restcountries.com and OpenStreetMap and caches the answers, so visitors'
// browsers never contact those services directly.

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

let countriesRequest: Promise<Country[]> | null = null;

function loadCountries(): Promise<Country[]> {
  countriesRequest ??= fetch(`${API_URL}/api/geo/countries`)
    .then((res) => (res.ok ? res.json() : []))
    .then((data: unknown) => (Array.isArray(data) ? (data as Country[]) : []))
    .catch(() => []);
  return countriesRequest.then((list) => {
    if (list.length === 0) countriesRequest = null; // try again next time
    return list;
  });
}

/** All countries (a short built-in list until the full one has loaded). */
export function useCountries(): Country[] {
  const [countries, setCountries] = useState<Country[]>(LOCAL_COUNTRIES);
  useEffect(() => {
    let active = true;
    loadCountries().then((list) => {
      if (active && list.length > 0) setCountries(list);
    });
    return () => {
      active = false;
    };
  }, []);
  return countries;
}

/** Country list and city suggestions for the location fields. */
export function useLocationSuggestions(country: string, city: string) {
  const countries = useCountries();
  const [cities, setCities] = useState<string[]>([]);

  const countryCode =
    countries.find(
      (c) => c.name.toLowerCase().trim() === country.toLowerCase().trim(),
    )?.code ?? "";

  useEffect(() => {
    if (!countryCode || city.trim().length < 2) {
      setCities([]);
      return;
    }
    let active = true;
    const delay = setTimeout(() => {
      const params = new URLSearchParams({ country: countryCode, q: city });
      fetch(`${API_URL}/api/geo/cities?${params}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: unknown) => {
          if (active) setCities(Array.isArray(data) ? (data as string[]) : []);
        })
        .catch(() => {
          if (active) setCities([]);
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [city, countryCode]);

  return { countries, cities };
}
