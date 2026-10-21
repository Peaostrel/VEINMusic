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
// The English copy lives in JSON, apart from the markup it fills
import content from "./content.json";

const ICONS = { ChartColumn, Trophy, Users, Zap };
const features = content.features.map((f) => ({
  ...f,
  icon: ICONS[f.icon as keyof typeof ICONS],
}));
const { steps, faq } = content;

const title = "VEIN Music — every song you play, in one history";
const description =
  "Scrobbler and listening stats for Yandex Music, Spotify, SoundCloud, YouTube Music and VK: charts, levels and achievements.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/en",
    languages: { ru: "/", en: "/en", "x-default": "/" },
  },
  openGraph: { ...openGraph(title, description, "/en"), locale: "en_US" },
};

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
