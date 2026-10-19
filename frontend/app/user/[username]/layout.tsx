import type { Metadata } from "next";
import { Suspense } from "react";
import JsonLd from "@/components/JsonLd";
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

/** Streamed after the page, so a slow API never holds the page back. */
async function ProfileData({ params }: Params) {
  const { username } = await params;
  const p = await requestPreviewJson<UserPreview>(
    `/user/${encodeURIComponent(username)}`,
  );
  return <JsonLd data={p ? profileData(p, userDescription(p)) : null} />;
}

export default function ProfileLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode }> & Params) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ProfileData params={params} />
      </Suspense>
    </>
  );
}
