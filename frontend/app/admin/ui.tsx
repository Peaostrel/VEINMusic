"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson, type ApiInit } from "@/app/lib/api";
import StatusText from "@/components/StatusText";

// Shared building blocks of the admin panel tabs

export const panelClass =
  "rounded-xl border border-line bg-surface p-5 space-y-4";
export const inputClass =
  "w-full h-9 rounded-lg border border-line bg-bg px-3 text-[13px] text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-fg-3";
export const labelClass = "mb-1.5 block text-xs text-fg-2";

const buttonBase =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
export const buttonClass = {
  primary: `${buttonBase} bg-accent text-on-accent hover:brightness-110`,
  secondary: `${buttonBase} border border-line text-fg hover:bg-surface-2`,
  danger: `${buttonBase} border border-danger-line text-danger hover:bg-[#2a1b1b]`,
};

export function PanelTitle({
  icon,
  children,
}: Readonly<{ icon?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-fg [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-fg-3">
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

/** Message line under an admin form ("✅ …" / "❌ …" shown as an icon). */
export function Notice({ text }: Readonly<{ text: string }>) {
  return <StatusText text={text} className="text-xs" />;
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
      className="flex items-center justify-end gap-2 text-xs text-fg-2"
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
