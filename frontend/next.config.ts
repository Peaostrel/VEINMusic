import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const wsHost = process.env.NEXT_PUBLIC_WS_URL || "127.0.0.1:8000";

// The captcha of the sign-in form (app/auth/Captcha.tsx): one of the two
// providers, chosen on the API by CAPTCHA_PROVIDER
const captchaOrigins = [
  "https://smartcaptcha.yandexcloud.net",
  "https://challenges.cloudflare.com",
];

// Origins the browser may connect to (fetch / WebSocket)
const connectSrc = [
  "'self'",
  ...captchaOrigins,
  apiUrl,
  apiUrl.replace(/^http/, "ws"),
  `ws://${wsHost}`,
  `wss://${wsHost}`,
];

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; eval is only needed by the dev server
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${captchaOrigins.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  // Avatars, covers and artwork come from arbitrary user-provided hosts
  "img-src * data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(" ")}`,
  `frame-src ${captchaOrigins.join(" ")}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
