import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import AppShell from "./shell/AppShell";
import PWARegistration from "../components/PWARegistration";

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

export const metadata: Metadata = {
  title: "VEINMusic",
  description: "Вся музыка, что вы слушаете, — в одной истории",
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
      </body>
    </html>
  );
}
