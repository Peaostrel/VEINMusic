import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/preview";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Personal and service pages: nothing to find there without an account
      disallow: [
        "/admin",
        "/auth",
        "/feed",
        "/goals",
        "/library",
        "/link",
        "/settings",
        "/together/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
