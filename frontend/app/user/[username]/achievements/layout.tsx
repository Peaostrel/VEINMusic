import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ username: string }> }>): Promise<Metadata> {
  const { username } = await params;
  // The profile layout's own title stops the root template, so spell it out
  return { title: { absolute: `Достижения @${username} — VEINMusic` } };
}

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
