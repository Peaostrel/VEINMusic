import About from "./AboutView";
import { landingData } from "./landingData";

export default async function AboutPage() {
  return <About initial={await landingData()} />;
}
