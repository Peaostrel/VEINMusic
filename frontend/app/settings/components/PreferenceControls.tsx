"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { btn, inputOnCard } from "@/components/ui";

export const settingsCard =
  "overflow-hidden rounded-xl border border-line bg-surface";

export function SettingsIntro({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <header>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-fg-2">
        {description}
      </p>
    </header>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: Readonly<{
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}>) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-line-soft px-5 py-4 last:border-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-fg-2">
          {description}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${checked ? "bg-accent" : "bg-line"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition-transform ${checked ? "translate-x-6 bg-on-accent" : "translate-x-1 bg-fg-2"}`}
        />
      </button>
    </div>
  );
}

export function SelectRow<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
}: Readonly<{
  title: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}>) {
  return (
    <label className="flex flex-col gap-3 border-b border-line-soft px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-fg-2">
          {description}
        </span>
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 min-w-[190px] rounded-lg border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-fg-3"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TagEditor({
  title,
  description,
  values,
  placeholder,
  onChange,
}: Readonly<{
  title: string;
  description: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}>) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (
      !value ||
      values.some((item) => item.toLowerCase() === value.toLowerCase())
    )
      return;
    onChange([...values, value]);
    setDraft("");
  };
  return (
    <section className={`${settingsCard} p-5`}>
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-fg-2">{description}</p>
      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputOnCard}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className={`${btn.secondary} ${btn.md}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Добавить
        </button>
      </div>
      {values.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs"
            >
              <span className="max-w-[260px] truncate">{value}</span>
              <button
                type="button"
                onClick={() =>
                  onChange(values.filter((item) => item !== value))
                }
                aria-label={`Удалить ${value}`}
                className="text-fg-3 hover:text-danger"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-fg-3">Список пуст.</p>
      )}
    </section>
  );
}

export function CheckboxGrid({
  values,
  options,
  onChange,
}: Readonly<{
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}>) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const checked = values.includes(option.value);
        return (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-bg px-3 py-2.5 text-sm"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? values.filter((value) => value !== option.value)
                    : [...values, option.value],
                )
              }
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
