import type { Metadata } from "next";
import { getT } from "@/app/lib/i18n/server";
import { layoutWithJsonLd } from "@/components/JsonLd";
import { artistData } from "@/app/lib/structuredData";
import { artistDescription } from "@/app/_og/describe";
import {
  NO_INDEX,
  openGraph,
  requestPreviewJson,
  type ArtistPreview,
} from "@/app/lib/preview";

type Params = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { name } = await params;
  const t = await getT();
  const path = `/artist/${encodeURIComponent(name)}`;
  const a = await requestPreviewJson<ArtistPreview>(path);
  if (!a) return { title: name, robots: NO_INDEX };
  const description = artistDescription(a, t);
  return {
    title: a.name,
    description,
    alternates: { canonical: `/artist/${encodeURIComponent(a.name)}` },
    openGraph: openGraph(a.name, description, path, "website", t.lang),
    ...(a.indexable === false ? { robots: NO_INDEX } : {}),
  };
}

async function artistJsonLd({ params }: Params) {
  const { name } = await params;
  const a = await requestPreviewJson<ArtistPreview>(
    `/artist/${encodeURIComponent(name)}`,
  );
  return a ? artistData(a, artistDescription(a, await getT())) : null;
}

export default layoutWithJsonLd(artistJsonLd);
