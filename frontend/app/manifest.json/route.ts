import { msg } from "@/app/lib/i18n/core";
import { getT } from "@/app/lib/i18n/server";

// Web app manifest in the visitor's language. Browsers fetch it without
// cookies, so this mostly follows Accept-Language (see getLang).
export async function GET() {
  const t = await getT();
  const icon192 = { src: "/icon-192.png", sizes: "192x192" };
  const shortcut = (
    name: string,
    shortName: string,
    description: string,
    url: string,
  ) => ({
    name: t(name),
    short_name: t(shortName),
    description: t(description),
    url,
    icons: [icon192],
  });
  const manifest = {
    name: "VEINMusic",
    short_name: "VEINMusic",
    description: t("Вся музыка, что вы слушаете, — в одной истории"),
    lang: t.lang,
    start_url: "/",
    display: "standalone",
    background_color: "#0e0f10",
    theme_color: "#0e0f10",
    icons: [
      { ...icon192, type: "image/png", purpose: "any maskable" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    shortcuts: [
      shortcut(
        msg("Лента"),
        msg("Лента"),
        msg("Лента прослушиваний со всего мира"),
        "/feed",
      ),
      shortcut(
        msg("Топ слушателей"),
        msg("Топ"),
        msg("Топ слушателей недели"),
        "/leaderboard",
      ),
      shortcut(
        msg("Настройки"),
        msg("Настройки"),
        msg("Управление профилем и интеграциями"),
        "/settings",
      ),
    ],
  };
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Vary: "Accept-Language, Cookie",
    },
  });
}
