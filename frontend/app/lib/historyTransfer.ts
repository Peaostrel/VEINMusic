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

export async function readHistoryFile(
  file: File,
): Promise<Record<string, unknown>[]> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      "Максимальный размер файла — 20 МБ. Разделите большую историю на части.",
    );
  const text = await file.text();
  const parsed = file.name.toLowerCase().endsWith(".csv")
    ? parseHistoryCsv(text)
    : JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.scrobbles;
  if (!Array.isArray(rows) || !rows.length || rows.length > 50000)
    throw new Error(
      "В файле должно быть от 1 до 50 000 прослушиваний. Большую историю разделите на части.",
    );
  return rows;
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
