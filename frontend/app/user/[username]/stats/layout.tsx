import type { Metadata } from "next";
import { getT } from "@/app/lib/i18n/server";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ username: string }> }>): Promise<Metadata> {
  const { username } = await params;
  // The profile layout's own title stops the root template, so spell it out
  const t = await getT();
  return {
    title: { absolute: t("Статистика @{username} — VEINMusic", { username }) },
  };
}

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
