import type { Metadata } from "next";
import { Suspense } from "react";
import JsonLd from "@/components/JsonLd";
import { trackData } from "@/app/lib/structuredData";
import { trackDescription, trackTitle } from "@/app/_og/describe";
import {
  NO_INDEX,
  openGraph,
  requestPreviewJson,
  type TrackPreview,
} from "@/app/lib/preview";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const path = `/track/${encodeURIComponent(id)}`;
  const t = /^\d+$/.test(id)
    ? await requestPreviewJson<TrackPreview>(path)
    : null;
  if (!t) return { title: "Трек", robots: NO_INDEX };
  const title = trackTitle(t);
  const description = trackDescription(t);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraph(title, description, path, "music.song"),
    ...(t.indexable === false ? { robots: NO_INDEX } : {}),
  };
}

/** Streamed after the page, so a slow API never holds the page back. */
async function TrackData({ params }: Params) {
  const { id } = await params;
  const t = /^\d+$/.test(id)
    ? await requestPreviewJson<TrackPreview>(`/track/${encodeURIComponent(id)}`)
    : null;
  return <JsonLd data={t ? trackData(t, trackDescription(t)) : null} />;
}

export default function TrackLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode }> & Params) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <TrackData params={params} />
      </Suspense>
    </>
  );
}
