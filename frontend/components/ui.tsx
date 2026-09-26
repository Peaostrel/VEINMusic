import type { ReactNode } from "react";

/*
 * Shared building blocks for the "restrained dark" design.
 * Class strings are exported too, for places where a component is overkill
 * (links styled as buttons, native inputs inside existing forms).
 */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

/** Button looks. Combine a variant with a size: `${btn.primary} ${btn.md}`. */
export const btn = {
  primary: `${btnBase} bg-accent text-on-accent hover:brightness-110`,
  secondary: `${btnBase} border border-line text-fg hover:bg-surface-2`,
  ghost: `${btnBase} text-fg-2 hover:bg-surface-2 hover:text-fg`,
  danger: `${btnBase} border border-danger-line text-danger hover:bg-[#2a1b1b]`,
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4",
  lg: "h-12 px-5 text-[15px]",
  icon: `${btnBase} h-9 w-9 text-fg-2 hover:bg-surface-2 hover:text-fg`,
};

export const card = "rounded-xl border border-line bg-surface";

const inputBase =
  "h-10 w-full rounded-lg border border-line px-3 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-fg-3";

/** Text field on the page background. */
export const input = `${inputBase} bg-surface`;
/** Text field inside a card (darker than the card). */
export const inputOnCard = `${inputBase} bg-bg`;

export const textarea =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-fg-3 resize-none";

export const label = "mb-1.5 block text-xs text-fg-2";

export const mono = "font-mono";

/** Page title with an optional subtitle and actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  id,
}: Readonly<{
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
}>) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1
          id={id}
          className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg"
        >
          {title}
        </h1>
        {subtitle && <p className="text-sm text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

/** Small heading used inside cards and asides. */
export function SectionTitle({
  children,
  aside,
  id,
  as: Tag = "h2",
}: Readonly<{
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
  as?: "h2" | "h3";
}>) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Tag id={id} className="text-sm font-semibold text-fg">
        {children}
      </Tag>
      {aside && <span className="text-xs text-fg-3">{aside}</span>}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  id: T;
  label: ReactNode;
}

/** Segmented control (tabs look). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label: ariaLabel,
  role = "tablist",
  className = "",
}: Readonly<{
  options: SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  role?: "tablist" | "radiogroup";
  className?: string;
}>) {
  const itemRole = role === "tablist" ? "tab" : "radio";
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`flex gap-0.5 rounded-lg border border-line bg-surface p-[3px] ${className}`}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role={itemRole}
            aria-selected={itemRole === "tab" ? active : undefined}
            aria-checked={itemRole === "radio" ? active : undefined}
            onClick={() => onChange(o.id)}
            className={`h-[30px] flex-1 whitespace-nowrap rounded-md px-3.5 text-[13px] transition-colors ${
              active ? "bg-line text-fg" : "text-fg-2 hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Underlined tabs for page sections. */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
  label: ariaLabel,
}: Readonly<{
  options: SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="hide-scrollbar flex gap-6 overflow-x-auto border-b border-line-soft"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`-mb-px h-10 shrink-0 border-b-2 text-sm transition-colors ${
              active
                ? "border-accent font-medium text-fg"
                : "border-transparent text-fg-2 hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Round avatar with a generated fallback. */
export function Avatar({
  src,
  seed,
  size = 32,
  className = "",
}: Readonly<{
  src?: string | null;
  seed: string;
  size?: number;
  className?: string;
}>) {
  const fallback = `https://api.dicebear.com/9.x/micah/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
  return (
    <img
      src={src || fallback}
      alt=""
      width={size}
      height={size}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== fallback) img.src = fallback;
      }}
      className={`shrink-0 rounded-full bg-surface-2 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Label + big monospaced number. */
export function Stat({
  label: text,
  value,
  hint,
  className = "",
}: Readonly<{
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-fg-2">{text}</span>
      <span className="font-mono text-2xl font-medium tracking-[-0.01em] text-fg">
        {value}
      </span>
      {hint && <span className="font-mono text-xs text-fg-3">{hint}</span>}
    </div>
  );
}

/** Thin horizontal bar (share, progress). */
export function Meter({
  value,
  max = 100,
  accent = true,
  className = "",
  height = 3,
}: Readonly<{
  value: number;
  max?: number;
  accent?: boolean;
  className?: string;
  height?: number;
}>) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      aria-hidden="true"
      className={`block overflow-hidden rounded-full bg-line ${className}`}
      style={{ height }}
    >
      <span
        className={`block h-full rounded-full ${accent ? "bg-accent" : "bg-bar"}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** Centered message for empty lists and errors. */
export function EmptyState({
  title,
  children,
  action,
}: Readonly<{ title: ReactNode; children?: ReactNode; action?: ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <p className="max-w-sm text-sm text-fg-2">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Quiet loading line. */
export function Loading({
  label: text = "Загрузка…",
}: Readonly<{ label?: string }>) {
  return (
    <output className="flex items-center justify-center gap-3 py-16 text-sm text-fg-3">
      <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="eq-bar block w-[3px] rounded-full bg-fg-3"
            style={{ height: 14, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      {text}
    </output>
  );
}

/** Animated "now playing" bars in the accent colour. */
export function PlayingBars({
  className = "",
}: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-3 items-end gap-[2px] ${className}`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-bar block w-[2px] rounded-full bg-accent"
          style={{ height: 12, animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}
