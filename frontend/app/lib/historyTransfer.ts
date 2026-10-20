/** Parse VEIN's quoted CSV without executing spreadsheet formulas. */
export function parseHistoryCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(cell);
      cell = "";
      if (char === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (char !== "\r" || quoted) cell += char;
  }
  if (quoted) throw new Error("CSV содержит незакрытые кавычки");
  // Empty trailing rows are removed by the decoder.
  row.push(cell);
  rows.push(row);
  return decodeCsvRows(rows);
}

function decodeCsvRows(rows: string[][]): Record<string, unknown>[] {
  const headers = rows.shift() ?? [];
  if (!["played_at", "artist", "title"].every((name) => headers.includes(name)))
    throw new Error("Нужен CSV истории VEIN с датой, артистом и треком");
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => {
      if (values.length !== headers.length)
        throw new Error("Число колонок CSV не совпадает с заголовком");
      return Object.fromEntries(
        headers.map((name, index) => {
          let value = values[index];
          if (/^'[=+\-@\t\r\n]/.test(value)) value = value.slice(1);
          if (name === "duration" || name === "listened_sec")
            return [name, Number(value || 0)];
          if (name === "excluded_from_stats")
            return [name, value.toLowerCase() === "true"];
          if (name === "source") return [name, value || "transfer"];
          return [name, value || null];
        }),
      );
    });
}

/** Plays shorter than this are skips, as on Last.fm and ListenBrainz. */
const MIN_PLAY_MS = 30_000;
const MAX_ROWS = 100_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 600 * 1024 * 1024;

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function seconds(ms: unknown): number {
  return typeof ms === "number" && ms > 0
    ? Math.min(86400, Math.round(ms / 1000))
    : 0;
}

/** Spotify "Extended streaming history": `ts` is when playback stopped. */
function fromSpotify(item: Row): Row | null {
  const title = text(item.master_metadata_track_name);
  const artist = text(item.master_metadata_album_artist_name);
  const played = typeof item.ms_played === "number" ? item.ms_played : 0;
  const stopped = Date.parse(String(item.ts ?? ""));
  if (!title || !artist || played < MIN_PLAY_MS || Number.isNaN(stopped))
    return null;
  return {
    played_at: new Date(stopped - played).toISOString(),
    artist,
    title,
    album: text(item.master_metadata_album_album_name),
    listened_sec: seconds(played),
    source: "spotify_import",
  };
}

/** Spotify "Account data" (StreamingHistory_music_*.json) has no time zone. */
function fromSpotifyAccount(item: Row): Row | null {
  const title = text(item.trackName);
  const artist = text(item.artistName);
  const played = typeof item.msPlayed === "number" ? item.msPlayed : 0;
  const stopped = Date.parse(`${String(item.endTime ?? "").replace(" ", "T")}:00Z`);
  if (!title || !artist || played < MIN_PLAY_MS || Number.isNaN(stopped))
    return null;
  return {
    played_at: new Date(stopped - played).toISOString(),
    artist,
    title,
    listened_sec: seconds(played),
    source: "spotify_import",
  };
}

function fromListenBrainz(item: Row): Row | null {
  const meta = (item.track_metadata ?? {}) as Row;
  const info = (meta.additional_info ?? {}) as Row;
  const title = text(meta.track_name);
  const artist = text(meta.artist_name);
  const when = typeof item.listened_at === "number" ? item.listened_at : NaN;
  if (!title || !artist || Number.isNaN(when)) return null;
  return {
    played_at: new Date(when * 1000).toISOString(),
    artist,
    title,
    album: text(meta.release_name),
    duration: seconds(info.duration_ms ?? Number(info.duration ?? 0) * 1000),
    source: "listenbrainz_import",
  };
}

/** Turn any supported export into VEIN history rows; null for other JSON. */
export function convertHistoryRows(items: unknown[]): Row[] | null {
  const rows = items.filter(
    (item): item is Row => !!item && typeof item === "object",
  );
  const first = rows[0] ?? {};
  let convert: ((item: Row) => Row | null) | null = null;
  if ("ms_played" in first && "ts" in first) convert = fromSpotify;
  else if ("msPlayed" in first && "endTime" in first)
    convert = fromSpotifyAccount;
  else if ("listened_at" in first && "track_metadata" in first)
    convert = fromListenBrainz;
  else if ("played_at" in first && "artist" in first && "title" in first)
    return rows;
  if (!convert) return rows.length ? null : [];
  return rows.map(convert).filter((row): row is Row => row !== null);
}

/** Parse one JSON, JSON Lines or VEIN CSV file; null when it holds no history. */
export function parseHistoryText(name: string, source: string): Row[] | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return parseHistoryCsv(source);
  const body = source.replace(/^\uFEFF/, "").trim();
  if (!body) return [];
  if (lower.endsWith(".jsonl") || (body[0] === "{" && body.includes("}\n{")))
    return convertHistoryRows(
      body
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line)),
    );
  const parsed = JSON.parse(body);
  const rows = Array.isArray(parsed) ? parsed : parsed?.scrobbles;
  return Array.isArray(rows) ? convertHistoryRows(rows) : null;
}

/** History files inside a ZIP export, read with the browser's own inflater. */
async function unzipHistory(file: File): Promise<{ name: string; text: string }[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index--)
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index;
      break;
    }
  if (end < 0) throw new Error("ZIP-архив повреждён");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files: { name: string; text: string }[] = [];
  let total = 0;
  for (let entry = 0; entry < count; entry++) {
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("ZIP-архив повреждён");
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    const lower = name.toLowerCase();
    const base = lower.split("/").pop() ?? "";
    if (!/\.(json|jsonl|csv)$/.test(base) || base.startsWith(".")) continue;
    total += size;
    if (total > MAX_UNZIPPED_BYTES)
      throw new Error("Архив слишком большой: распакуйте его и загрузите файлы частями");
    const start =
      local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    let content: Uint8Array;
    if (method === 0) content = data;
    else if (method === 8)
      content = new Uint8Array(
        await new Response(
          new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
        ).arrayBuffer(),
      );
    else throw new Error(`Файл ${name} сжат неподдерживаемым способом`);
    files.push({ name, text: decoder.decode(content) });
  }
  return files;
}

/** Read VEIN, Spotify or ListenBrainz exports (files or ZIP) into one sorted history. */
export async function readHistoryFiles(files: File[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const file of files) {
    const isZip = file.name.toLowerCase().endsWith(".zip");
    if (file.size > (isZip ? MAX_ZIP_BYTES : MAX_FILE_BYTES))
      throw new Error(
        isZip
          ? "Максимальный размер архива — 200 МБ."
          : `Файл ${file.name} больше 20 МБ. Разделите его на части.`,
      );
    const parts = isZip
      ? await unzipHistory(file)
      : [{ name: file.name, text: await file.text() }];
    for (const part of parts) {
      let parsed: Row[] | null;
      try {
        parsed = parseHistoryText(part.name, part.text);
      } catch (cause) {
        // Archives also carry playlists, settings and other unrelated files.
        if (isZip) continue;
        throw cause;
      }
      if (!parsed) {
        if (isZip) continue;
        throw new Error(`Не удалось распознать формат файла ${part.name}`);
      }
      for (const row of parsed) rows.push(row);
      if (rows.length > MAX_ROWS)
        throw new Error(
          "За один перенос можно загрузить до 100 000 прослушиваний. Выберите меньше файлов.",
        );
    }
  }
  if (!rows.length)
    throw new Error("В файлах не нашлось прослушиваний длиннее 30 секунд");
  return rows.sort((a, b) =>
    String(a.played_at).localeCompare(String(b.played_at)),
  );
}

/** Keep account mutations ordered and stop at the first failed batch. */
export function sequentialMap<T, U>(
  items: T[],
  action: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  return items.reduce<Promise<U[]>>(async (previous, item, index) => {
    const results = await previous;
    results.push(await action(item, index));
    return results;
  }, Promise.resolve([]));
}

/** The API takes at most this many plays per request… */
const BATCH_ROWS = 5000;
/** …and at most 2 MB per request; batches stay below it with room to spare. */
const BATCH_BYTES = 1_500_000;

/** Split plays into requests the API accepts, by count and by size. */
export function historyBatches(
  rows: Record<string, unknown>[],
): Record<string, unknown>[][] {
  const encoder = new TextEncoder();
  const batches: Record<string, unknown>[][] = [];
  let current: Record<string, unknown>[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1;
    if (
      current.length &&
      (current.length >= BATCH_ROWS || bytes + size > BATCH_BYTES)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}
