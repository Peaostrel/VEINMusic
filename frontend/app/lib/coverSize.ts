// Music services store covers at 400–1000 px; lists show them at 30–64 px.
// Their CDNs serve smaller variants by URL, so thumbnails ask for the
// smallest one still sharp on a 2x screen (a 400 px Yandex cover is ~60 KB,
// its 100 px variant ~4 KB). Unknown URLs are returned unchanged.

const YANDEX =
  /^(https:\/\/avatars\.yandex\.net\/get-music-content\/.+\/)(\d+)x(\d+)$/;
const YANDEX_SIZES = [50, 100, 150, 200, 300, 400, 1000];
const DEEZER =
  /^(https:\/\/cdn-images\.dzcdn\.net\/images\/(?:cover|artist)\/[0-9a-f]+\/)(\d+)x(\d+)(-[\w-]+\.jpg)$/;
const DEEZER_SIZES = [56, 120, 250, 500, 1000];
const SOUNDCLOUD =
  /^(https:\/\/i\d*\.sndcdn\.com\/[\w-]+?-)(t500x500|t300x300|large|crop|original)(\.\w+)$/;
const SOUNDCLOUD_LARGEST: [number, string] = [500, "t500x500"];
const SOUNDCLOUD_SIZES: [number, string][] = [
  [100, "large"],
  [300, "t300x300"],
  [400, "crop"],
  SOUNDCLOUD_LARGEST,
];

function pick(sizes: number[], wanted: number, current: number): number {
  const size = sizes.find((s) => s >= wanted) ?? Math.max(...sizes);
  return Math.min(size, current);
}

/** A variant of `url` at least `cssPx` × 2 pixels wide, never larger than
 * the original. */
export function coverAt(url: string, cssPx: number): string;
export function coverAt(
  url: string | null | undefined,
  cssPx: number,
): string | null | undefined;
export function coverAt(
  url: string | null | undefined,
  cssPx: number,
): string | null | undefined {
  if (!url) return url;
  const wanted = Math.ceil(cssPx * 2);
  let m = YANDEX.exec(url);
  if (m) {
    const size = pick(YANDEX_SIZES, wanted, Number(m[2]));
    return `${m[1]}${size}x${size}`;
  }
  m = DEEZER.exec(url);
  if (m) {
    const size = pick(DEEZER_SIZES, wanted, Number(m[2]));
    return `${m[1]}${size}x${size}${m[4]}`;
  }
  m = SOUNDCLOUD.exec(url);
  if (m && m[2] !== "original") {
    const current = SOUNDCLOUD_SIZES.find(([, name]) => name === m?.[2]);
    const [px, name] =
      SOUNDCLOUD_SIZES.find(([size]) => size >= wanted) ?? SOUNDCLOUD_LARGEST;
    if (current && px < current[0]) return `${m[1]}${name}${m[3]}`;
  }
  return url;
}
