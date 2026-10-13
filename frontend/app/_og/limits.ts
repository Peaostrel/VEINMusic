/**
 * Keeps link-preview pictures cheap. Drawing one PNG takes noticeable CPU and
 * memory, and the picture URLs accept any name, so without limits anyone
 * could make the site's server draw pictures nonstop. Here:
 *
 * - a picture drawn recently is served again from memory;
 * - at most `MAX_ACTIVE` pictures are drawn at a time and `MAX_WAITING`
 *   wait for their turn; anything beyond gets the fallback picture.
 */
import { createHash } from "node:crypto";

const MAX_ACTIVE = 2;
const MAX_WAITING = 8;
const CACHE_ENTRIES = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface Drawn {
  body: ArrayBuffer;
  headers: [string, string][];
  expires: number;
}

const cache = new Map<string, Drawn>();
let active = 0;
// Drawn once, outside the queue, and kept for the life of the process
let spare: Promise<Drawn> | null = null;
const waiting: (() => void)[] = [];

function respond(drawn: Drawn): Response {
  return new Response(drawn.body, { headers: drawn.headers });
}

async function draw(make: () => Promise<Response>): Promise<Drawn> {
  const res = await make();
  return {
    body: await res.arrayBuffer(),
    headers: [...res.headers.entries()],
    expires: Date.now() + CACHE_TTL_MS,
  };
}

function remember(key: string, drawn: Drawn) {
  cache.delete(key);
  cache.set(key, drawn);
  while (cache.size > CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function turn(): Promise<void> {
  if (active < MAX_ACTIVE) {
    active++;
    return;
  }
  // The finishing drawing hands its slot over, so `active` stays the same
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

/** A key for what the picture shows (images are hashed, not stored twice). */
export function cardKey(props: unknown): string {
  return createHash("sha256").update(JSON.stringify(props)).digest("hex");
}

/**
 * The picture for `key`: from memory, freshly drawn by `make`, or, when too
 * many are being drawn already, the one `fallback` draws (drawn once).
 */
export async function limitedCard(
  key: string,
  make: () => Promise<Response>,
  fallback: () => Promise<Response>,
): Promise<Response> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    remember(key, hit);
    return respond(hit);
  }
  if (active >= MAX_ACTIVE && waiting.length >= MAX_WAITING) {
    spare ??= draw(fallback).catch((error: unknown) => {
      spare = null;
      throw error;
    });
    return respond(await spare);
  }
  await turn();
  try {
    const drawn = await draw(make);
    remember(key, drawn);
    return respond(drawn);
  } finally {
    release();
  }
}
