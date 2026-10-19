import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn, Trophy, Users, Zap } from "lucide-react";
import {
  FeatureGrid,
  HeroIntro,
  NumbersStrip,
  StepsSection,
} from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { openGraph, publicApiJson } from "@/app/lib/preview";
import { websiteData } from "@/app/lib/structuredData";
import type { PublicStats } from "@/app/about/AboutView";

const title = "VEIN Music — every song you play, in one history";
const description =
  "Scrobbler and listening stats for Yandex Music, Spotify, SoundCloud, YouTube Music and VK: charts, levels, achievements and listening together.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/en",
    languages: { ru: "/", en: "/en", "x-default": "/" },
  },
  openGraph: { ...openGraph(title, description, "/en"), locale: "en_US" },
};

const features = [
  {
    icon: Zap,
    title: "Scrobbling from every service",
    text: "Yandex Music, Spotify and SoundCloud connect directly, with no browser tab open. YouTube Music, VK and other web players work through the VEIN extension.",
  },
  {
    icon: ChartColumn,
    title: "Honest statistics",
    text: "Hour-by-hour history, top artists, tracks and albums for any period, a listening calendar and your own Wrapped whenever you want it.",
  },
  {
    icon: Trophy,
    title: "Levels and achievements",
    text: "Earn XP for every track you play to 85%, keep a daily streak, climb the ranks and compete on the leaderboard.",
  },
  {
    icon: Users,
    title: "Listen together",
    text: "Follow friends, see what they play right now, compare tastes and open a room where everyone hears the same track.",
  },
];

const steps = [
  {
    title: "Create a profile",
    text: "Sign up with a username and password. No email or phone number needed.",
  },
  {
    title: "Connect your music",
    text: "Link Yandex Music, Spotify or SoundCloud, install the extension, or import your Last.fm history.",
  },
  {
    title: "Watch your stats grow",
    text: "Every play shows up in your profile within seconds.",
  },
];

const faq = [
  {
    q: "Are there ads?",
    a: "No. VEIN shows exactly what came from your player, with no ads and no sponsored picks.",
  },
  {
    q: "Do I need the browser extension?",
    a: "No. Yandex Music, Spotify and SoundCloud connect directly. The extension is for YouTube Music, VK and other web players.",
  },
  {
    q: "Is the site in English?",
    a: "The app itself is in Russian for now. Charts, numbers and track names read the same in any language.",
  },
  {
    q: "Who can see my history?",
    a: "You decide: make your profile public or private, and choose what your friends see in their feed.",
  },
  {
    q: "Can I take my data with me?",
    a: "Yes. Export your whole history from the settings, or delete your account together with its data.",
  },
];

const fmt = new Intl.NumberFormat("en-US");

export default async function EnglishLanding() {
  // Site-wide counts only, shared between visitors for 30 s
  const stats = await publicApiJson<PublicStats>("/api/public-stats", 30);
  const numbers = [
    { label: "plays", value: stats?.total_scrobbles },
    { label: "unique tracks", value: stats?.total_tracks },
    { label: "listeners", value: stats?.total_users },
    { label: "listening now", value: stats?.online },
  ];
  return (
    <div lang="en" className="flex flex-col pb-20">
      <JsonLd data={{ ...websiteData(description), inLanguage: "en" }} />
      <section
        aria-labelledby="hero-title"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 pb-16 pt-14 sm:px-6 lg:pb-20 lg:pt-24"
      >
        <HeroIntro
          title="Your music."
          subtitle="Your history."
          text="VEIN collects everything you play on Yandex Music, Spotify, YouTube Music, VK and SoundCloud into one history, with charts, hourly stats and a feed of what your friends are playing."
          primary={{ href: "/auth?mode=register", label: "Start scrobbling" }}
          extensionLabel="Browser extension"
        />
        <p className="text-[13px] text-fg-3">
          <Link href="/" hrefLang="ru" lang="ru" className="hover:text-fg-2">
            Русская версия
          </Link>
        </p>
      </section>

      <NumbersStrip
        label="VEIN in numbers"
        numbers={numbers}
        format={fmt.format}
      />

      <section
        aria-labelledby="features-title"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pt-20 sm:px-6 lg:pt-24"
      >
        <h2
          id="features-title"
          className="text-[30px] font-semibold tracking-[-0.025em] md:text-4xl"
        >
          What VEIN does
        </h2>
        <FeatureGrid features={features} columns={2} />
      </section>

      <StepsSection title="How it works" steps={steps} />

      <section
        aria-labelledby="faq-title"
        className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 pt-20 sm:px-6 lg:pt-24"
      >
        <h2
          id="faq-title"
          className="text-2xl font-semibold tracking-[-0.02em]"
        >
          Questions
        </h2>
        <div className="border-t border-line-soft">
          {faq.map((item, i) => (
            <details
              key={item.q}
              open={i === 0}
              className="group border-b border-line-soft"
            >
              <summary className="cursor-pointer list-none py-4 text-[15px] font-medium">
                {item.q}
              </summary>
              <p className="pb-4 text-sm leading-relaxed text-fg-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
