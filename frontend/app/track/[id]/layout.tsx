import type { Metadata } from "next";
import { getT } from "@/app/lib/i18n/server";
import { layoutWithJsonLd } from "@/components/JsonLd";
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
  const tr = await getT();
  const path = `/track/${encodeURIComponent(id)}`;
  const t = /^\d+$/.test(id)
    ? await requestPreviewJson<TrackPreview>(path)
    : null;
  if (!t) return { title: tr("Трек"), robots: NO_INDEX };
  const title = trackTitle(t);
  const description = trackDescription(t, tr);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraph(title, description, path, "music.song", tr.lang),
    ...(t.indexable === false ? { robots: NO_INDEX } : {}),
  };
}

async function trackJsonLd({ params }: Params) {
  const { id } = await params;
  const t = /^\d+$/.test(id)
    ? await requestPreviewJson<TrackPreview>(`/track/${encodeURIComponent(id)}`)
    : null;
  return t ? trackData(t, trackDescription(t, await getT())) : null;
}

export default layoutWithJsonLd(trackJsonLd);
