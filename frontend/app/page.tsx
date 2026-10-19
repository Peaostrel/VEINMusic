import Home from "./HomeView";
import About from "./about/AboutView";
import { landingData } from "./about/landingData";
import JsonLd from "@/components/JsonLd";
import { websiteData } from "./lib/structuredData";

const description = "Вся музыка, что вы слушаете, — в одной истории";

export default async function HomePage() {
  return (
    <>
      <JsonLd data={websiteData(description)} />
      <Home landing={<About initial={await landingData()} />} />
    </>
  );
}
