import type { Metadata } from "next";
import { userDescription, userTitle } from "@/app/_og/describe";
import {
  NO_INDEX,
  openGraph,
  previewJson,
  type UserPreview,
} from "@/app/lib/preview";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const path = `/user/${encodeURIComponent(username)}`;
  const p = await previewJson<UserPreview>(path);
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

export default function ProfileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
