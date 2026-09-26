import { formatNumber } from "@/app/lib/plural";
import { sourceLabel } from "@/utils/formatters";
import { SOURCE_NAMES } from "./links";

/** Summary numbers at the top of the stats page. */
export function StatTiles({
  totalScrobbles,
  totalTimeMin,
  uniqueArtists,
  uniqueTracks,
  avgPerDay,
  topSource,
  diversity,
}: Readonly<{
  totalScrobbles: number;
  totalTimeMin: number;
  uniqueArtists: number;
  uniqueTracks: number;
  avgPerDay: number;
  topSource: string;
  diversity: number;
}>) {
  const hours = Math.floor(totalTimeMin / 60);
  const minutes = totalTimeMin % 60;
  const tiles = [
    { label: "Прослушиваний", value: formatNumber(totalScrobbles) },
    { label: "Музыки", value: `${formatNumber(hours)} ч ${minutes} м` },
    { label: "Артистов", value: formatNumber(uniqueArtists) },
    { label: "Разных треков", value: formatNumber(uniqueTracks) },
    { label: "В среднем за день", value: formatNumber(avgPerDay) },
    {
      label: "Разнообразие",
      value: `${diversity}%`,
      hint: "доля разных треков",
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div
            key={t.label}
            title={t.hint}
            className="flex flex-col-reverse gap-1.5 rounded-xl border border-line bg-surface px-4 py-4"
          >
            <dt className="text-xs text-fg-2">{t.label}</dt>
            <dd className="whitespace-nowrap font-mono text-[22px] font-medium">
              {t.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fg-3">
        Чаще всего слушаете через{" "}
        <span className="text-fg-2">
          {SOURCE_NAMES[topSource] || sourceLabel(topSource)}
        </span>
      </p>
    </div>
  );
}
