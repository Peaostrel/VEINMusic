import type { Metadata } from "next";
import { artistDescription } from "@/app/_og/describe";
import {
  NO_INDEX,
  openGraph,
  previewJson,
  type ArtistPreview,
} from "@/app/lib/preview";

type Params = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { name } = await params;
  const path = `/artist/${encodeURIComponent(name)}`;
  const a = await previewJson<ArtistPreview>(path);
  if (!a) return { title: name, robots: NO_INDEX };
  const description = artistDescription(a);
  return {
    title: a.name,
    description,
    alternates: { canonical: `/artist/${encodeURIComponent(a.name)}` },
    openGraph: openGraph(a.name, description, path),
  };
}

export default function ArtistLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
