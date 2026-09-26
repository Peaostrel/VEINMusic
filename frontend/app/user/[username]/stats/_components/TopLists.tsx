import type { DetailedStats } from "@/app/lib/types";
import { getPlatformIcon } from "../../../../../utils/formatters";
import { getAlbumUrl, getArtistUrl, getTrackUrl } from "./links";

const card = "bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl";
const heading = "text-xl font-black text-white mb-6 flex items-center gap-2";
const playsBadge =
  "font-black text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs shadow-sm shrink-0";

/** Row with a background bar proportional to the plays of the #1 entry. */
function RankedRow({
  widthPercent,
  children,
}: Readonly<{ widthPercent: number; children: React.ReactNode }>) {
  return (
    <li className="relative group">
      {children}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 h-full bg-[var(--accent)]/10 rounded-xl transition-all duration-1000 -z-0"
        style={{ width: `${widthPercent}%` }}
      />
    </li>
  );
}

/** Comma-separated artists, each linking to a search on the service. */
function ArtistLinks({
  artists,
  source,
}: Readonly<{ artists: string; source: string }>) {
  const names = artists.split(",").map((a) => a.trim());
  return (
    <div className="text-xs text-gray-400 pointer-events-auto break-words pl-[22px]">
      {names.map((name, idx) => (
        <span key={name}>
          <a
            href={getArtistUrl(name, source)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--accent-text)] hover:underline transition-colors font-medium"
          >
            {name}
          </a>
          {idx < names.length - 1 ? ", " : ""}
        </span>
      ))}
    </div>
  );
}

const empty = <p className="text-gray-400">Нет данных</p>;

export function TopTracksCard({
  tracks,
}: Readonly<{ tracks: DetailedStats["top_tracks"] }>) {
  return (
    <section className={card} aria-labelledby="top-tracks">
      <h2 id="top-tracks" className={heading}>
        <span aria-hidden="true">🔥</span> Топ треков
      </h2>
      {tracks.length === 0 ? (
        empty
      ) : (
        <ol className="space-y-4">
          {tracks.map((t, i) => (
            <RankedRow
              key={`${t.title}-${t.artist}-${t.source}`}
              widthPercent={(t.plays / tracks[0].plays) * 100}
            >
              <div className="flex items-start gap-3 relative z-10 p-2 border border-transparent hover:border-white/5 rounded-xl transition-colors">
                <span className="text-gray-400 font-bold w-4 text-right shrink-0 mt-2">
                  {i + 1}
                </span>
                {t.cover_url ? (
                  <img
                    src={t.cover_url}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded shadow-sm object-cover shrink-0 mt-0.5"
                    alt=""
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-10 h-10 rounded bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-sm text-yellow-500/80 shadow-sm shrink-0 mt-0.5"
                  >
                    🎵
                  </div>
                )}
                <div className="flex-grow min-w-0">
                  <div className="flex items-start gap-1.5 mb-0.5">
                    <div className="mt-1 shrink-0">
                      {getPlatformIcon(t.source)}
                    </div>
                    <a
                      href={getTrackUrl(t)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-white text-sm hover:text-[var(--accent-text)] hover:underline transition-colors break-words leading-tight"
                    >
                      {t.title}
                    </a>
                  </div>
                  <ArtistLinks artists={t.artist} source={t.source} />
                </div>
                <span
                  className={`${playsBadge} mt-1`}
                  title={`${t.plays} прослушиваний`}
                >
                  {t.plays}
                </span>
              </div>
            </RankedRow>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TopArtistsCard({
  artists,
  topSource,
}: Readonly<{ artists: DetailedStats["top_artists"]; topSource: string }>) {
  return (
    <section className={card} aria-labelledby="top-artists">
      <h2 id="top-artists" className={heading}>
        <span aria-hidden="true">🎤</span> Топ артистов
      </h2>
      {artists.length === 0 ? (
        empty
      ) : (
        <ol className="space-y-4">
          {artists.map((a, i) => (
            <RankedRow
              key={`${a.name}-${a.source}`}
              widthPercent={(a.plays / artists[0].plays) * 100}
            >
              <div className="flex items-start gap-3 relative z-10 p-2 py-3 border border-transparent hover:border-white/5 rounded-xl transition-colors">
                <span className="text-gray-400 font-bold w-4 text-right shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-grow min-w-0 pointer-events-auto">
                  <div className="flex items-start gap-1.5 mb-0.5">
                    <div className="mt-0.5 shrink-0">
                      {getPlatformIcon(a.source)}
                    </div>
                    <a
                      href={getArtistUrl(a.name, topSource)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-white text-sm hover:text-[var(--accent-text)] hover:underline transition-colors break-words"
                    >
                      {a.name}
                    </a>
                  </div>
                </div>
                <span
                  className={`${playsBadge} mt-0.5`}
                  title={`${a.plays} прослушиваний`}
                >
                  {a.plays}
                </span>
              </div>
            </RankedRow>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TopAlbumsCard({
  albums,
}: Readonly<{ albums: DetailedStats["top_albums"] }>) {
  return (
    <section className={card} aria-labelledby="top-albums">
      <h2 id="top-albums" className={heading}>
        <span aria-hidden="true">💿</span> Топ альбомов
      </h2>
      {albums.length === 0 ? (
        empty
      ) : (
        <ol className="space-y-4">
          {albums.map((album, i) => (
            <RankedRow
              key={`${album.album}-${album.artist}-${album.source}`}
              widthPercent={(album.plays / albums[0].plays) * 100}
            >
              <div className="flex items-start gap-3 relative z-10 p-2 py-3 border border-transparent hover:border-white/5 rounded-xl transition-colors">
                <span className="text-gray-400 font-bold w-4 text-right shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {album.cover_url && (
                  <img
                    src={album.cover_url}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="w-10 h-10 rounded object-cover shadow-sm shrink-0"
                    alt=""
                  />
                )}
                <div className="flex-grow min-w-0 pointer-events-auto">
                  <div className="flex items-start gap-1.5 mb-0.5">
                    <div className="mt-0.5 shrink-0">
                      {getPlatformIcon(album.source)}
                    </div>
                    <a
                      href={getAlbumUrl(
                        album.album,
                        album.artist,
                        album.source,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-white text-sm hover:text-[var(--accent-text)] hover:underline transition-colors break-words leading-tight"
                    >
                      {album.album}
                    </a>
                  </div>
                  {album.artist && (
                    <ArtistLinks artists={album.artist} source={album.source} />
                  )}
                </div>
                <span
                  className={`${playsBadge} mt-0.5`}
                  title={`${album.plays} прослушиваний`}
                >
                  {album.plays}
                </span>
              </div>
            </RankedRow>
          ))}
        </ol>
      )}
    </section>
  );
}
