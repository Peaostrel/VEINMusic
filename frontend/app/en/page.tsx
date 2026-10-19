import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn, Download, Trophy, Users, Zap } from "lucide-react";
import { btn } from "@/components/ui";
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
        <h1
          id="hero-title"
          className="text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[64px]"
        >
          Your music.
          <br />
          <span className="text-fg-3">Your history.</span>
        </h1>
        <p className="max-w-[560px] text-lg leading-relaxed text-fg-2">
          VEIN collects everything you play on Yandex Music, Spotify, YouTube
          Music, VK and SoundCloud into one history, with charts, hourly stats
          and a feed of what your friends are playing.
        </p>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Link
            href="/auth?mode=register"
            className={`${btn.primary} ${btn.lg}`}
          >
            Start scrobbling
          </Link>
          <Link href="/extension" className={`${btn.secondary} ${btn.lg}`}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Browser extension
          </Link>
        </div>
        <p className="text-[13px] text-fg-3">
          <Link href="/" hrefLang="ru" lang="ru" className="hover:text-fg-2">
            Русская версия
          </Link>
        </p>
      </section>

      <section
        aria-label="VEIN in numbers"
        className="border-y border-line-soft"
      >
        <dl className="mx-auto grid w-full max-w-[1200px] grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
          {numbers.map((n, i) => (
            <div
              key={n.label}
              className={`flex flex-col-reverse gap-1.5 py-6 md:py-8 ${
                i % 2 === 1 ? "border-l border-line-soft pl-5 md:pl-8" : ""
              } ${i === 2 ? "md:border-l md:border-line-soft md:pl-8" : ""} ${
                i >= 2 ? "border-t border-line-soft md:border-t-0" : ""
              }`}
            >
              <dt className="text-[13px] text-fg-2">{n.label}</dt>
              <dd className="font-mono text-2xl font-medium tracking-[-0.02em] md:text-[32px]">
                {n.value === undefined ? "—" : fmt.format(n.value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

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
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2">
          {features.map((f) => (
            <article key={f.title} className="flex flex-col gap-3.5 bg-bg p-7">
              <f.icon
                className="h-[22px] w-[22px] text-accent"
                aria-hidden="true"
              />
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-fg-2">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="how-title"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pt-20 sm:px-6 lg:pt-24"
      >
        <h2
          id="how-title"
          className="text-[30px] font-semibold tracking-[-0.025em] md:text-4xl"
        >
          How it works
        </h2>
        <ol className="grid gap-10 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={`flex flex-col gap-3.5 border-t pt-5 ${i === 0 ? "border-accent" : "border-line"}`}
            >
              <span
                className={`font-mono text-[13px] ${i === 0 ? "text-accent" : "text-fg-3"}`}
              >
                0{i + 1}
              </span>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-fg-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

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
