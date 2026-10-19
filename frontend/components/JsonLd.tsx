import { Suspense } from "react";

type Data = Record<string, unknown> | null;

/**
 * A schema.org block in the page's HTML. It is data, not a script the
 * browser runs, so the nonce-based CSP does not apply to it; "<" is escaped
 * so user-written names can't close the tag.
 */
export default function JsonLd({ data }: Readonly<{ data: Data }>) {
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

async function Resolved({ data }: Readonly<{ data: Promise<Data> }>) {
  return <JsonLd data={await data} />;
}

/** JSON-LD streamed after the page, so a slow API never holds it back. */
export function StreamedJsonLd({ data }: Readonly<{ data: Promise<Data> }>) {
  return (
    <Suspense fallback={null}>
      <Resolved data={data} />
    </Suspense>
  );
}

/**
 * A layout that renders its page and the JSON-LD `load` builds from the
 * route's params.
 */
export function layoutWithJsonLd<P>(load: (props: P) => Promise<Data>) {
  return function JsonLdLayout(
    props: Readonly<{ children: React.ReactNode }> & P,
  ) {
    return (
      <>
        {props.children}
        <StreamedJsonLd data={load(props)} />
      </>
    );
  };
}
