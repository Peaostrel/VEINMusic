import { Fragment } from "react";
import type { DetailedStats } from "@/app/lib/types";
import { Meter } from "@/components/ui";
import { getAlbumUrl, getArtistUrl, getTrackUrl } from "./links";

/** Comma-separated artists, each linking to a search on the service. */
function ArtistLinks({
  artists,
  source,
}: Readonly<{ artists: string; source: string }>) {
  const names = artists
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  return (
    <span className="block truncate text-xs text-fg-2">
      {names.map((name, idx) => (
        <Fragment key={name}>
          {idx > 0 && ", "}
          <a
            href={getArtistUrl(name, source)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg hover:underline"
          >
            {name}
          </a>
        </Fragment>
      ))}
    </span>
  );
}

function Cover({ src }: Readonly<{ src: string | null | undefined }>) {
  return src ? (
    <img
      src={src}
      referrerPolicy="no-referrer"
      alt=""
      className="h-10 w-10 shrink-0 rounded object-cover"
    />
  ) : (
    <span className="h-10 w-10 shrink-0 rounded bg-surface-2" />
  );
}

function Section({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const empty = <p className="text-sm text-fg-3">Нет данных</p>;
const row =
  "grid grid-cols-[20px_40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line-soft py-2.5";

export function TopTracksCard({
  tracks,
}: Readonly<{ tracks: DetailedStats["top_tracks"] }>) {
  return (
    <Section id="top-tracks" title="Треки">
      {tracks.length === 0 ? (
        empty
      ) : (
        <ol className="border-t border-line-soft">
          {tracks.map((t, i) => (
            <li key={`${t.title}-${t.artist}-${t.source}`} className={row}>
              <span className="font-mono text-xs text-fg-3">{i + 1}</span>
              <Cover src={t.cover_url} />
              <span className="min-w-0">
                <a
                  href={getTrackUrl(t)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm hover:underline"
                >
                  {t.title}
                </a>
                <ArtistLinks artists={t.artist} source={t.source} />
              </span>
              <span className="font-mono text-[13px] text-fg-2">{t.plays}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export function TopArtistsCard({
  artists,
  topSource,
}: Readonly<{ artists: DetailedStats["top_artists"]; topSource: string }>) {
  const max = artists[0]?.plays || 1;
  return (
    <Section id="top-artists" title="Артисты">
      {artists.length === 0 ? (
        empty
      ) : (
        <ol className="flex flex-col gap-3 pt-1">
          {artists.map((a, i) => (
            <li
              key={a.name}
              className="grid grid-cols-[20px_minmax(0,1fr)_56px] items-center gap-3"
            >
              <span className="font-mono text-xs text-fg-3">{i + 1}</span>
              <span className="flex min-w-0 flex-col gap-1.5">
                <a
                  href={getArtistUrl(a.name, a.source || topSource)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm font-medium hover:underline"
                >
                  {a.name}
                </a>
                <Meter value={a.plays} max={max} accent={i === 0} />
              </span>
              <span className="text-right font-mono text-[13px] text-fg-2">
                {a.plays}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export function TopAlbumsCard({
  albums,
}: Readonly<{ albums: DetailedStats["top_albums"] }>) {
  return (
    <Section id="top-albums" title="Альбомы">
      {albums.length === 0 ? (
        empty
      ) : (
        <ol className="border-t border-line-soft">
          {albums.map((album, i) => (
            <li
              key={`${album.album}-${album.artist}-${album.source}`}
              className={row}
            >
              <span className="font-mono text-xs text-fg-3">{i + 1}</span>
              <Cover src={album.cover_url} />
              <span className="min-w-0">
                <a
                  href={getAlbumUrl(album.album, album.artist, album.source)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm hover:underline"
                >
                  {album.album}
                </a>
                <ArtistLinks artists={album.artist} source={album.source} />
              </span>
              <span className="font-mono text-[13px] text-fg-2">
                {album.plays}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
