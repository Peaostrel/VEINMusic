import type { Metadata } from "next";
import { Suspense } from "react";
import JsonLd from "@/components/JsonLd";
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
  const path = `/artist/${encodeURIComponent(name)}`;
  const a = await requestPreviewJson<ArtistPreview>(path);
  if (!a) return { title: name, robots: NO_INDEX };
  const description = artistDescription(a);
  return {
    title: a.name,
    description,
    alternates: { canonical: `/artist/${encodeURIComponent(a.name)}` },
    openGraph: openGraph(a.name, description, path),
    ...(a.indexable === false ? { robots: NO_INDEX } : {}),
  };
}

/** Streamed after the page, so a slow API never holds the page back. */
async function ArtistData({ params }: Params) {
  const { name } = await params;
  const a = await requestPreviewJson<ArtistPreview>(
    `/artist/${encodeURIComponent(name)}`,
  );
  return <JsonLd data={a ? artistData(a, artistDescription(a)) : null} />;
}

export default function ArtistLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode }> & Params) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ArtistData params={params} />
      </Suspense>
    </>
  );
}
