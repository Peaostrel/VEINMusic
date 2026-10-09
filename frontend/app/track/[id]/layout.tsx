import type { Metadata } from "next";
import { trackDescription, trackTitle } from "@/app/_og/describe";
import {
  NO_INDEX,
  openGraph,
  previewJson,
  type TrackPreview,
} from "@/app/lib/preview";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const path = `/track/${encodeURIComponent(id)}`;
  const t = /^\d+$/.test(id) ? await previewJson<TrackPreview>(path) : null;
  if (!t) return { title: "Трек", robots: NO_INDEX };
  const title = trackTitle(t);
  const description = trackDescription(t);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraph(title, description, path, "music.song"),
  };
}

export default function TrackLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
