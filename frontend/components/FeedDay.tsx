/** Group successive feed records by their date in the viewer's timezone. */
export function feedDay(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function FeedDay({ date }: Readonly<{ date: string }>) {
  return (
    <li className="list-none pt-6 pb-2">
      <h2 className="text-xs font-medium text-fg-2">{date}</h2>
    </li>
  );
}
