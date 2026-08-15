export function sanitizeUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url || typeof url !== "string") return undefined;

  const trimmed = url.trim();
  if (/^\/[a-zA-Z0-9_/.-]*$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    ) {
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
  if (/^\/[a-zA-Z0-9_/.-]*$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Invalid image URL format
  }

  return undefined;
}
