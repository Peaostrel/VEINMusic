/**
 * The 1200×630 picture messengers and social networks show for a shared
 * link: the site's dark theme, the avatar or cover on the left, the name and
 * a few numbers on the right. Rendered by next/og (Satori + Resvg), which
 * supports only flexbox and inline styles.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_URL } from "@/app/lib/preview";

/** Must match `size` in the opengraph-image routes. */
const OG_SIZE = { width: 1200, height: 630 };

const C = {
  bg: "#0e0f10",
  surface: "#16171a",
  line: "#26282c",
  fg: "#ededeb",
  fg2: "#a9acb2",
  fg3: "#80848c",
  accent: "#e3a93b",
  onAccent: "#121212",
};

const LOGO_PATH = "M6 6V12.5M11 10V18M16 15V26M21 10V18M26 6V12.5";

const fontDir = join(process.cwd(), "app/_og/fonts");
const fonts = Promise.all([
  readFile(join(fontDir, "IBMPlexSans-Regular.ttf")),
  readFile(join(fontDir, "IBMPlexSans-SemiBold.ttf")),
  readFile(join(fontDir, "IBMPlexMono-Medium.ttf")),
]);

export interface CardStat {
  value: string;
  label: string;
}

export interface CardProps {
  /** Small caps label above the title: «ПРОФИЛЬ», «ИСПОЛНИТЕЛЬ», «ТРЕК». */
  kicker: string;
  title: string;
  subtitle?: string | null;
  stats?: CardStat[];
  /** Data URL of the avatar or cover; without it the initial is drawn. */
  image?: string | null;
  round?: boolean;
  /** Draw the VEINMusic mark instead of a picture (pages of the site itself). */
  logo?: boolean;
}

function Logo({ size }: Readonly<{ size: number }>) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4.6),
        background: C.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={Math.round(size * 0.7)}
        height={Math.round(size * 0.7)}
        viewBox="0 0 32 32"
      >
        <path
          d={LOGO_PATH}
          fill="none"
          stroke={C.onAccent}
          strokeWidth={3.2}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function Picture({
  image,
  initial,
  round,
}: Readonly<{ image?: string | null; initial: string; round?: boolean }>) {
  const radius = round ? 170 : 28;
  if (image) {
    return (
      <img
        src={image}
        width={340}
        height={340}
        alt=""
        style={{ borderRadius: radius, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 340,
        height: 340,
        borderRadius: radius,
        background: C.surface,
        border: `2px solid ${C.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.accent,
        fontSize: 150,
        fontWeight: 600,
      }}
    >
      {initial}
    </div>
  );
}

/** Equalizer bars, the site's motif, fading towards the left. */
function Bars() {
  const heights = [34, 52, 41, 70, 58, 88, 64, 47, 76, 55, 38, 61, 45];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        height: 30,
        marginRight: 24,
      }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: `${h}%`,
            marginLeft: 4,
            borderRadius: 2,
            background: C.accent,
            opacity: 0.15 + i * 0.05,
          }}
        />
      ))}
    </div>
  );
}

/** Long names get a smaller font so they fit in two lines. */
function titleFontSize(title: string): number {
  if (title.length > 26) return 52;
  if (title.length > 16) return 62;
  return 72;
}

export async function renderCard({
  kicker,
  title,
  subtitle,
  stats = [],
  image,
  round,
  logo,
}: CardProps): Promise<ImageResponse> {
  const [regular, semibold, mono] = await fonts;
  const initial = (title.trim()[0] || "V").toUpperCase();
  const titleSize = titleFontSize(title);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.fg,
        fontFamily: "Plex",
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          padding: "64px 72px 0",
        }}
      >
        {logo ? (
          <Logo size={340} />
        ) : (
          <Picture image={image} initial={initial} round={round} />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 56,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: "PlexMono",
              fontSize: 22,
              letterSpacing: 3,
              color: C.accent,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 600,
              lineHeight: 1.08,
              marginTop: 14,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: 30,
                color: C.fg2,
                marginTop: 14,
                lineHeight: 1.25,
              }}
            >
              {subtitle}
            </div>
          ) : null}
          {stats.length ? (
            <div style={{ display: "flex", marginTop: 40 }}>
              {stats.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    marginRight: 48,
                    maxWidth: 300,
                  }}
                >
                  <div style={{ fontSize: 40, fontWeight: 600 }}>{s.value}</div>
                  <div style={{ fontSize: 22, color: C.fg3, marginTop: 4 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "0 72px",
          padding: "28px 0 44px",
          borderTop: `2px solid ${C.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <Logo size={48} />
          <div style={{ display: "flex", marginLeft: 16, fontSize: 32 }}>
            <span style={{ fontWeight: 600 }}>VEIN</span>
            <span style={{ color: C.fg2 }}>Music</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Bars />
          <div style={{ fontFamily: "PlexMono", fontSize: 24, color: C.fg3 }}>
            {new URL(SITE_URL).host}
          </div>
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Plex", data: regular, weight: 400, style: "normal" },
        { name: "Plex", data: semibold, weight: 600, style: "normal" },
        { name: "PlexMono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
