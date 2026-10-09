import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import AppShell from "./shell/AppShell";
import PWARegistration from "../components/PWARegistration";
import { SITE_URL, openGraph } from "./lib/preview";
import MaintenanceOverlay from "../components/MaintenanceOverlay";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0e0f10",
  width: "device-width",
  initialScale: 1,
};

const description = "Вся музыка, что вы слушаете, — в одной истории";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "VEINMusic", template: "%s — VEINMusic" },
  description,
  openGraph: openGraph("VEINMusic", description, "/"),
  twitter: { card: "summary_large_image" },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VEINMusic",
  },
};

/*
 * Runs before first paint: marks signed-in visitors so the shell CSS shows
 * the sidebar layout straight away (no flash of the guest header).
 */
const authFlagScript = `try{var u=localStorage.getItem("username");if(u&&!["null","undefined","false","[]","{}"].includes(u.trim().toLowerCase()))document.documentElement.dataset.auth="1"}catch(e){}`;
const preferencesScript = `try{var p=JSON.parse(localStorage.getItem("vein_preferences")||"{}");var a=p.appearance||{};var m=a.color_mode||"dark";if(m==="system")m=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var r=document.documentElement;r.dataset.colorMode=m;r.dataset.density=a.density||"comfortable";r.dataset.fontScale=a.font_scale||"normal";r.dataset.reduceMotion=a.reduce_motion?"1":"0";r.dataset.highContrast=a.high_contrast?"1":"0";r.dataset.backgroundBlur=a.background_blur===false?"0":"1"}catch(e){}`;

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: authFlagScript }} />
        <script dangerouslySetInnerHTML={{ __html: preferencesScript }} />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-bg font-sans text-fg antialiased"
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-sm"
        >
          К содержимому
        </a>
        <AppShell>{children}</AppShell>
        <PWARegistration />
        <MaintenanceOverlay />
      </body>
    </html>
  );
}
