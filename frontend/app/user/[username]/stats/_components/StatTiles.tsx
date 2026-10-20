import { formatNumber } from "@/app/lib/plural";
import { sourceLabel } from "@/utils/formatters";
import { useT } from "@/app/lib/i18n/client";
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
  const t = useT();
  const hours = Math.floor(totalTimeMin / 60);
  const minutes = totalTimeMin % 60;
  const tiles = [
    { label: t("Прослушиваний"), value: formatNumber(totalScrobbles) },
    {
      label: t("Музыки"),
      value: t("{h} ч {m} м", { h: formatNumber(hours), m: minutes }),
    },
    { label: t("Артистов"), value: formatNumber(uniqueArtists) },
    { label: t("Разных треков"), value: formatNumber(uniqueTracks) },
    { label: t("В среднем за день"), value: formatNumber(avgPerDay) },
    {
      label: t("Разнообразие"),
      value: `${diversity}%`,
      hint: t("доля разных треков"),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((tile, index) => (
          <div
            key={tile.label}
            title={tile.hint}
            className={`flex min-w-0 flex-col-reverse gap-2 rounded-xl px-5 py-5 ${index < 2 ? "bg-accent-soft" : "bg-surface"}`}
          >
            <dt className="text-xs text-fg-2">{tile.label}</dt>
            <dd className="break-words font-mono text-2xl font-medium tracking-tight sm:text-3xl">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fg-3">
        {t("Чаще всего слушаете через")}{" "}
        <span className="text-fg-2">
          {SOURCE_NAMES[topSource]
            ? t(SOURCE_NAMES[topSource])
            : sourceLabel(topSource)}
        </span>
      </p>
    </div>
  );
}
