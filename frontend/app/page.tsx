import { Suspense } from "react";
import Home from "./HomeView";
import About from "./about/AboutView";
import { landingData } from "./about/landingData";
import JsonLd from "@/components/JsonLd";
import { websiteData } from "./lib/structuredData";

const description = "Вся музыка, что вы слушаете, — в одной истории";

/** The guest landing with the numbers, week and feed read on the server. */
async function Landing() {
  return <About initial={await landingData()} />;
}

export default function HomePage() {
  // Streamed: a signed-in visitor's dashboard never waits for guest data
  return (
    <>
      <JsonLd data={websiteData(description)} />
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
