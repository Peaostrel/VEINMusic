import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The Content-Security-Policy of pages is set per request by proxy.ts (a
// fresh nonce for Next's inline scripts instead of 'unsafe-inline').

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Pages opened from here (or that open us) get no handle on this window
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

// Crawlers and link-preview bots that read only the initial HTML: they get
// the page's metadata in <head> instead of streamed later. Next's default
// list (its Google-* entries folded into "Google") plus the bots of
// Telegram, Viber, Mail.ru and Odnoklassniki.
const HTML_LIMITED_BOTS = [
  "Google",
  "Chrome-Lighthouse",
  "Slurp",
  "DuckDuckBot",
  "baiduspider",
  "yandex",
  "sogou",
  "bitlybot",
  "tumblr",
  "vkShare",
  "quora link preview",
  "redditbot",
  "ia_archiver",
  "Bingbot",
  "BingPreview",
  "applebot",
  "facebookexternalhit",
  "facebookcatalog",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
  "WhatsApp",
  "SkypeUriPreview",
  "Yeti",
  "TelegramBot",
  "Viber",
  "Mail.RU_Bot",
  "OdklBot",
];
const htmlLimitedBots = new RegExp(
  HTML_LIMITED_BOTS.map((name) => name.replaceAll(".", String.raw`\.`)).join(
    "|",
  ),
  "i",
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  htmlLimitedBots,
  // The Docker image runs the self-contained server from .next/standalone
  // (a fraction of the full node_modules); local `next start` is unchanged.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default nextConfig;
