export function sanitizeUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url, "http://localhost");
    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    ) {
      return url;
    }
  } catch {
    console.warn("Invalid URL format:", url);
  }

  if (url.startsWith("/")) {
    return url;
  }

  return "about:blank";
}
