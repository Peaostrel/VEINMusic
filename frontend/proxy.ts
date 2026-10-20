import { NextResponse, type NextRequest } from "next/server";

// Content-Security-Policy of every page, with a fresh nonce per request.
// Next.js reads the nonce from the request's CSP header and puts it on its
// own inline scripts; app/layout.tsx puts it on ours. An injected <script>
// then has no valid nonce and does not run ('unsafe-inline' allowed it).

const isDev = process.env.NODE_ENV !== "production";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const wsHost = process.env.NEXT_PUBLIC_WS_URL || "127.0.0.1:8000";

// The captcha of the sign-in form (app/auth/Captcha.tsx): one of the two
// providers, chosen on the API by CAPTCHA_PROVIDER
const captchaOrigins = [
  "https://smartcaptcha.yandexcloud.net",
  "https://challenges.cloudflare.com",
];

// VK ID One Tap (components/VkIdButton.tsx): its button is an iframe and
// the SDK reports its own analytics to the VK API
const vkidOrigins = ["https://id.vk.ru", "https://id.vk.com"];

// Origins the browser may connect to (fetch / WebSocket)
const connectSrc = [
  "'self'",
  ...captchaOrigins,
  ...vkidOrigins,
  "https://api.vk.ru",
  apiUrl,
  apiUrl.replace(/^http/, "ws"),
  `ws://${wsHost}`,
  `wss://${wsHost}`,
];

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic': scripts loaded by trusted scripts (the captcha
    // widget) are trusted too; 'self' and the hosts only matter to browsers
    // without it. eval is only needed by the dev server.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} ${captchaOrigins.join(" ")}`,
    // style attributes can't carry a nonce; styles can't run code
    "style-src 'self' 'unsafe-inline'",
    // Avatars, covers and artwork come from arbitrary user-provided hosts
    "img-src * data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${[...captchaOrigins, ...vkidOrigins].join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not build assets, public files or link prefetches
      source:
        "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icon-192.png|icon-512.png|extension/|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
