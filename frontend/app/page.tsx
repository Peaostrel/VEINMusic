import type { Metadata } from "next";
import { Suspense } from "react";
import Home from "./HomeView";
import About from "./about/AboutView";
import { landingData } from "./about/landingData";
import JsonLd from "@/components/JsonLd";
import { websiteData } from "./lib/structuredData";
import { getT } from "./lib/i18n/server";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    languages: { ru: "/", en: "/en", "x-default": "/" },
  },
};

/** The guest landing with the numbers, week and feed read on the server. */
async function Landing() {
  return <About initial={await landingData()} />;
}

export default async function HomePage() {
  const t = await getT();
  const description = t("Вся музыка, что вы слушаете, — в одной истории");
  // Streamed: a signed-in visitor's dashboard never waits for guest data
  return (
    <>
      <JsonLd data={websiteData(description, t.lang)} />
      <Home
        landing={
          <Suspense fallback={<About />}>
            <Landing />
          </Suspense>
        }
      />
    </>
  );
}
