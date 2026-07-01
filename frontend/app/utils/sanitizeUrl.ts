export function sanitizeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  
  // Create a safe anchor element to parse the URL natively (optional, but good practice)
  // Or just rely on string matching for the scheme to prevent javascript: and data: text/html
  const lowerUrl = url.toLowerCase().trim();
  
  if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:text/html')) {
    return 'about:blank';
  }
  
  return url;
}
