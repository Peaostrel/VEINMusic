"use client";

import { Meter } from "@/components/ui";
import { sourceLabel } from "@/utils/formatters";

type CountMap = Record<string, number>;

const SOURCE_NAMES: Record<string, string> = {
  spotify: "Spotify",
  yandex: "Яндекс Музыка",
  yandex_music: "Яндекс Музыка",
  vk: "VK Музыка",
  youtube_music: "YouTube Music",
  soundcloud: "SoundCloud",
  apple_music: "Apple Music",
  lastfm: "Last.fm",
};

/** Neutral ramp for the non-leading slices of a share bar. */
const RAMP = ["var(--accent)", "#8c8f96", "#5e6168", "#45484e", "#303236"];

/**
 * Vertical bars with a label under each. The highest bar (or the one
 * `highlight` names) is drawn in the accent colour.
 */
export function BarStrip({
  data,
  label,
  highlight,
  height = 120,
  labelEvery = 1,
}: Readonly<{
  /** Either a map or ordered pairs (use pairs when order matters). */
  data: CountMap | [string, number][];
  label: string;
  highlight?: string;
  height?: number;
  labelEvery?: number;
}>) {
  const entries = (Array.isArray(data) ? data : Object.entries(data)).map(
    ([k, v]) => [k, Number(v)] as const,
  );
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const peak = highlight ?? entries.find(([, v]) => v === max)?.[0];
  const summary = entries.map(([k, v]) => k + " " + v).join(", ");
  return (
    <div
      role="img"
      aria-label={`${label}: ${summary}`}
      className="flex flex-col gap-2"
    >
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {entries.map(([k, v]) => (
          <div
            key={k}
            title={`${k}: ${v}`}
            className={`min-w-0 flex-1 rounded-t-sm ${k === peak ? "bg-accent" : "bg-bar"}`}
            style={{ height: Math.max(2, Math.round((v / max) * height)) }}
          />
        ))}
      </div>
      <div className="flex gap-[3px] font-mono text-[10px] text-fg-3">
        {entries.map(([k], i) => (
          <span key={k} className="min-w-0 flex-1 text-center">
            {i % labelEvery === 0 ? k : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Share of plays per platform as labelled meters. */
export function PlatformDistribution({ data }: Readonly<{ data: CountMap }>) {
  const rows = Object.entries(data)
    .map(([k, v]) => ({
      name: SOURCE_NAMES[k] || sourceLabel(k),
      value: Number(v),
    }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  if (rows.length === 0) return <p className="text-sm text-fg-3">Нет данных</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r, i) => {
        const pct = Math.round((r.value / total) * 100);
        return (
          <li key={r.name} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px]">
              <span>{r.name}</span>
              <span className="font-mono text-fg-2">{pct}%</span>
            </div>
            <Meter value={pct} accent={i === 0} height={4} />
          </li>
        );
      })}
    </ul>
  );
}

/** Genres as one stacked bar with a legend (top five + "Другое"). */
export function GenreCloud({ data }: Readonly<{ data: CountMap }>) {
  const sorted = Object.entries(data)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value);
  if (sorted.length === 0)
    return <p className="text-sm text-fg-3">Нет данных о жанрах</p>;
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((s, g) => s + g.value, 0);
  if (rest > 0) top.push({ name: "Другое", value: rest });
  const total = top.reduce((s, g) => s + g.value, 0) || 1;
  const parts = top.map((g, i) => ({
    ...g,
    pct: Math.round((g.value / total) * 100),
    color: RAMP[i] ?? RAMP.at(-1),
  }));
  return (
    <div className="flex flex-col gap-3.5">
      <div
        aria-hidden="true"
        className="flex h-2.5 gap-0.5 overflow-hidden rounded"
      >
        {parts.map((p) => (
          <span
            key={p.name}
            style={{ width: `${p.pct}%`, background: p.color }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {parts.map((p) => (
          <li
            key={p.name}
            className="flex items-center gap-2 text-[13px] text-fg-2"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-sm"
              style={{ background: p.color }}
            />
            {p.name}
            <span className="font-mono text-fg">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
