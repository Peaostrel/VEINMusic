const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

export function sanitizeUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url || typeof url !== "string") return undefined;

  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\")
  ) {
    return encodeURI(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    // Invalid URL format
  }

  return "about:blank";
}

export function sanitizeImageUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url || typeof url !== "string") return undefined;

  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\")
  ) {
    return encodeURI(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    // Invalid image URL format
  }

  return undefined;
}
