import { getPlatformIcon } from "../../../../../utils/formatters";
import { SOURCE_NAMES } from "./links";

function Tile({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="bg-[#121212]/70 p-5 rounded-2xl border border-white/5 shadow-xl flex-1 flex flex-col justify-center min-w-max">
      <div className="text-gray-400 text-xs font-bold uppercase tracking-normal whitespace-nowrap mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

const unit = "text-xs font-normal text-gray-400";

/** Summary numbers at the top of the stats page. */
export function StatTiles({
  totalScrobbles,
  totalTimeMin,
  uniqueArtists,
  uniqueTracks,
  avgPerDay,
  topSource,
}: Readonly<{
  totalScrobbles: number;
  totalTimeMin: number;
  uniqueArtists: number;
  uniqueTracks: number;
  avgPerDay: number;
  topSource: string;
}>) {
  const hours = Math.floor(totalTimeMin / 60);
  const minutes = totalTimeMin % 60;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:flex lg:flex-row gap-4 mb-8 overflow-x-auto pb-4 custom-scrollbar">
      <Tile label="Прослушано">
        <div className="text-2xl font-black text-white whitespace-nowrap">
          {totalScrobbles} <span className={unit}>тр.</span>
        </div>
      </Tile>
      <Tile label="Чистое время">
        <div className="text-2xl font-black text-[var(--accent-text)] whitespace-nowrap">
          {hours}
          <span className={`${unit} mx-1`}>ч</span>
          {minutes}
          <span className={`${unit} ml-1`}>м</span>
        </div>
      </Tile>
      <Tile label="Артистов">
        <div className="text-2xl font-black text-white whitespace-nowrap">
          {uniqueArtists}
        </div>
      </Tile>
      <Tile label="Уник. треков">
        <div className="text-2xl font-black text-white whitespace-nowrap">
          {uniqueTracks}
        </div>
      </Tile>
      <Tile label="В среднем в день">
        <div className="text-2xl font-black text-white whitespace-nowrap">
          {avgPerDay} <span className={unit}>тр.</span>
        </div>
      </Tile>
      <Tile label="Главная платформа">
        <div className="text-sm font-black text-[var(--accent-text)] flex items-center gap-2 mt-1 whitespace-nowrap">
          {getPlatformIcon(topSource)}{" "}
          <span>{SOURCE_NAMES[topSource] || topSource}</span>
        </div>
      </Tile>
    </div>
  );
}
