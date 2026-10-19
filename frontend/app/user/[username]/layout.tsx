import type { Metadata } from "next";
import { layoutWithJsonLd } from "@/components/JsonLd";
import { profileData } from "@/app/lib/structuredData";
import { userDescription, userTitle } from "@/app/_og/describe";
import {
  NO_INDEX,
  openGraph,
  requestPreviewJson,
  type UserPreview,
} from "@/app/lib/preview";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const path = `/user/${encodeURIComponent(username)}`;
  const p = await requestPreviewJson<UserPreview>(path);
  if (!p) return { title: `@${username}`, robots: NO_INDEX };
  const title = userTitle(p);
  const description = userDescription(p);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraph(title, description, path, "profile"),
    robots: p.indexable ? undefined : NO_INDEX,
  };
}

async function profileJsonLd({ params }: Params) {
  const { username } = await params;
  const p = await requestPreviewJson<UserPreview>(
    `/user/${encodeURIComponent(username)}`,
  );
  return p ? profileData(p, userDescription(p)) : null;
}

export default layoutWithJsonLd(profileJsonLd);
