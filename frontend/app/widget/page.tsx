import type { Metadata } from "next";
import { getT } from "@/app/lib/i18n/server";
import WidgetView from "./WidgetView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Виджет для iPhone"),
    description: t(
      "Что вы слушаете и статистика недели на экране iPhone: виджет Scriptable и команда для Siri.",
    ),
  };
}

export default function WidgetPage() {
  return <WidgetView />;
}
