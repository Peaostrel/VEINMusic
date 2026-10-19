/**
 * A schema.org block in the page's HTML. It is data, not a script the
 * browser runs, so the nonce-based CSP does not apply to it; "<" is escaped
 * so user-written names can't close the tag.
 */
export default function JsonLd({
  data,
}: Readonly<{ data: Record<string, unknown> | null }>) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replaceAll("<", "\\u003c"),
      }}
    />
  );
}
