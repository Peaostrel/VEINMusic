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

export function sanitizeImageUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url, "http://localhost");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    console.warn("Invalid image URL format:", url);
  }

  if (url.startsWith("/")) {
    return url;
  }

  return undefined;
}
