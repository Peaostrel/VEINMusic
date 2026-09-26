"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson, type ApiInit } from "@/app/lib/api";

// Shared building blocks of the admin panel tabs

export const panelClass =
  "bg-[#141418] border border-white/5 p-5 rounded-2xl space-y-4";
export const inputClass =
  "w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500";
export const labelClass =
  "block text-[10px] font-mono text-gray-400 uppercase mb-1";

const buttonBase =
  "px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
export const buttonClass = {
  primary: `${buttonBase} bg-red-600 hover:bg-red-500 text-white`,
  secondary: `${buttonBase} bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200`,
  danger: `${buttonBase} bg-red-950/60 hover:bg-red-900/60 border border-red-500/30 text-red-300`,
};

export function PanelTitle({
  icon,
  children,
}: Readonly<{ icon?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
      {icon}
      {children}
    </h3>
  );
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Message line under an admin form: "✅ …" or "❌ …". */
export function useNotice() {
  const [notice, setNotice] = useState("");
  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      try {
        await action();
        setNotice(`✅ ${success}`);
        return true;
      } catch (e) {
        setNotice(`❌ ${e instanceof Error ? e.message : "Ошибка"}`);
        return false;
      }
    },
    [],
  );
  return { notice, setNotice, run };
}

export function Notice({ text }: Readonly<{ text: string }>) {
  if (!text) return null;
  return (
    <output
      className={`block text-xs font-bold ${text.startsWith("❌") ? "text-red-400" : "text-emerald-400"}`}
    >
      {text}
    </output>
  );
}

/** Loads a JSON resource and reloads when `path` changes. */
export function useAdminResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    setLoading(true);
    apiJson<T>(path)
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Ошибка");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}

export function adminRequest<T = unknown>(path: string, init: ApiInit) {
  return apiJson<T>(path, init);
}

export function Pager({
  total,
  limit,
  offset,
  onChange,
}: Readonly<{
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}>) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav
      aria-label="Страницы"
      className="flex items-center justify-end gap-2 text-xs text-gray-400"
    >
      <button
        type="button"
        className={buttonClass.secondary}
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        ← Назад
      </button>
      <span className="font-mono">
        {page} / {pages}
      </span>
      <button
        type="button"
        className={buttonClass.secondary}
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Далее →
      </button>
    </nav>
  );
}

/** Query string from the defined, non-empty values. */
export function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
