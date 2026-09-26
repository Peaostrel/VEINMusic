"use client";

import { Headphones, MapPin, Speaker } from "lucide-react";
import { Meter } from "@/components/ui";
import {
  getArtistUrl,
  getTrackUrl,
  SocialIcons,
  getCountryCode,
  getNetworkLabel,
  getSocialUrl,
} from "./profileUtils";
import type {
  Country,
  SocialLink,
  TasteMatch,
  UserInfo,
} from "@/app/lib/types";

export interface ProfileStatsSectionProps {
  u: UserInfo;
  taste: TasteMatch | null;
  socialLinks: SocialLink[];
  countries: Country[];
  favoriteAlbumRedirectUrl: string;
}

function Fact({
  icon,
  label,
  children,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-fg-2">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[11px] text-fg-3">{label}</span>
        <span className="text-[13px] font-medium">{children}</span>
      </span>
    </div>
  );
}

function ShowcaseCard({
  kind,
  title,
  href,
  cover,
  round = false,
}: Readonly<{
  kind: string;
  title: string;
  href: string;
  cover?: string | null;
  round?: boolean;
}>) {
  const shape = round ? "rounded-full" : "rounded-lg";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2"
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          className={`h-16 w-16 shrink-0 object-cover ${shape}`}
        />
      ) : (
        <span className={`h-16 w-16 shrink-0 bg-surface-2 ${shape}`} />
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
          {kind}
        </span>
        <span className="break-words text-[15px] font-medium leading-snug">
          {title}
        </span>
      </span>
    </a>
  );
}

/** Taste match, links, facts (location, genre, gear) and the showcase. */
export function ProfileStatsSection({
  u,
  taste,
  socialLinks,
  countries,
  favoriteAlbumRedirectUrl,
}: Readonly<ProfileStatsSectionProps>) {
  let location: React.ReactNode = null;
  if (u.location) {
    const [countryName = "", cityName = ""] = u.location
      .split(",")
      .map((s: string) => s.trim());
    const code = getCountryCode(countryName, countries);
    const flagUrl = code
      ? `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.0/flags/4x3/${code.toLowerCase()}.svg`
      : null;
    location = (
      <Fact
        label="Местоположение"
        icon={
          flagUrl ? (
            <img
              src={flagUrl}
              alt=""
              className="h-full w-full scale-125 object-cover"
            />
          ) : (
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          )
        }
      >
        {countryName}
        {cityName ? `, ${cityName}` : ""}
      </Fact>
    );
  }

  const links = socialLinks
    .map((link) => ({ link, href: getSocialUrl(link.network, link.username) }))
    .filter((x): x is { link: SocialLink; href: string } => Boolean(x.href));
  const hasFacts = Boolean(location || u.favorite_genre || u.equipment);
  const hasShowcase = Boolean(
    u.favorite_artist || u.favorite_track || u.favorite_album,
  );

  if (!taste?.match && !links.length && !hasFacts && !hasShowcase) return null;

  return (
    <div className="flex flex-col gap-6">
      {(taste?.match !== undefined || links.length > 0 || hasFacts) && (
        <div className="flex flex-wrap items-stretch gap-2">
          {taste?.match !== undefined && (
            <div className="flex min-w-[220px] flex-col justify-center gap-1.5 rounded-lg border border-line px-3 py-2">
              <span className="flex items-baseline justify-between gap-3 text-[11px] text-fg-3">
                Совместимость вкусов
                <span className="font-mono text-[13px] text-fg">
                  {taste.match}%
                </span>
              </span>
              <Meter value={taste.match} />
              <span className="truncate text-[11px] text-fg-3">
                {taste.common_artists?.length > 0
                  ? taste.common_artists.join(", ")
                  : "пока нет общих артистов"}
              </span>
            </div>
          )}
          {location}
          {u.favorite_genre && (
            <Fact
              label="Жанр"
              icon={<Headphones className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {u.favorite_genre}
            </Fact>
          )}
          {u.equipment && (
            <Fact
              label="Аппаратура"
              icon={<Speaker className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {u.equipment}
            </Fact>
          )}
          {links.map(({ link, href }) => (
            <a
              key={link.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:h-4 [&_svg]:w-4"
            >
              {SocialIcons[link.network as keyof typeof SocialIcons]}
              {getNetworkLabel(link.network)}
            </a>
          ))}
        </div>
      )}

      {hasShowcase && (
        <section
          aria-labelledby="showcase-title"
          className="flex flex-col gap-3"
        >
          <h2 id="showcase-title" className="text-base font-semibold">
            Витрина
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {u.favorite_artist && (
              <ShowcaseCard
                kind="Артист"
                title={u.favorite_artist}
                cover={u.favorite_artist_cover}
                round
                href={
                  u.favorite_artist_url && u.favorite_artist_url !== "#"
                    ? u.favorite_artist_url
                    : getArtistUrl(u.favorite_artist, "yandex")
                }
              />
            )}
            {u.favorite_track && (
              <ShowcaseCard
                kind="Трек"
                title={u.favorite_track}
                cover={u.favorite_track_cover}
                href={
                  u.favorite_track_url && u.favorite_track_url !== "#"
                    ? u.favorite_track_url
                    : getTrackUrl({
                        artist: u.favorite_artist || "",
                        title: u.favorite_track,
                        source: "yandex",
                      })
                }
              />
            )}
            {u.favorite_album && (
              <ShowcaseCard
                kind="Альбом"
                title={u.favorite_album}
                cover={u.favorite_album_cover}
                href={favoriteAlbumRedirectUrl}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
