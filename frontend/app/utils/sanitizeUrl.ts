export function sanitizeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  
  const lowerUrl = url.toLowerCase().trim();

  // Strict allowlist to satisfy CodeQL's Client-side URL redirect and XSS
  if (
    lowerUrl.startsWith('http://') || 
    lowerUrl.startsWith('https://') || 
    lowerUrl.startsWith('/') ||
    lowerUrl.startsWith('mailto:')
  ) {
    return url;
  }

  return 'about:blank';
}
