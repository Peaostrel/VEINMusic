import Link from "next/link";

/** Five equalizer bars arranged as a V — the VEINMusic mark (32×32 grid). */
export const LOGO_PATH = "M6 6V12.5M11 10V18M16 15V26M21 10V18M26 6V12.5";

/** The mark alone, in the current colour. */
export function LogoGlyph({ size = 20 }: Readonly<{ size?: number }>) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={LOGO_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The mark on an accent tile — used in headers and the sidebar. */
export function LogoTile({ size = 28 }: Readonly<{ size?: number }>) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center bg-accent text-on-accent"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4.6),
      }}
    >
      <LogoGlyph size={Math.round(size * 0.7)} />
    </span>
  );
}

/** "VEIN" + "Music" set as one word. */
export function Wordmark({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <span className={`font-semibold tracking-[-0.01em] ${className}`}>
      VEIN<span className="font-normal text-fg-2">Music</span>
    </span>
  );
}

/** Tile + wordmark linking home. */
export function BrandLink({
  href = "/",
  size = 28,
  textClass = "text-[17px]",
}: Readonly<{ href?: string; size?: number; textClass?: string }>) {
  return (
    <Link
      href={href}
      aria-label="VEINMusic — на главную"
      className="flex items-center gap-2.5 rounded-md"
    >
      <LogoTile size={size} />
      <Wordmark className={textClass} />
    </Link>
  );
}
