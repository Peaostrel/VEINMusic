/**
 * User Profile Page
 * -----------------
 * Публичная страница профиля пользователя.
 * Отображает: аватар, статистику, уровни, достижения и
 * премиальные карточки локации/жанров/аппаратуры.
 */
"use client";
import Link from "next/link";
import { API_URL } from "@/app/lib/api";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { Loading, btn } from "@/components/ui";
import { getRankInfo, getNextRankInfo } from "@/app/lib/ranks";
import { ProfileActions } from "./_components/ProfileActions";
import { formatNumber } from "@/app/lib/plural";
import NowPlaying from "@/app/shell/NowPlaying";
import {
  ProfileHeaderSection,
  ProfileAchievements,
} from "./_components/ProfileHeaderSection";
import { ProfileStatsSection } from "./_components/ProfileStatsSection";
import { ProfileToasts } from "./_components/ProfileToasts";
import { WrappedModal } from "./_components/WrappedModal";
import { ImportConfirmModal } from "./_components/ImportConfirmModal";
import { FollowModal } from "./_components/FollowModal";
import { CompatibilityModal } from "./_components/CompatibilityModal";
import { ProfileMainGrid } from "./_components/ProfileMainGrid";
import { useProfilePage } from "./_components/useProfilePage";
import { coverAt } from "@/app/lib/coverSize";
import { useT } from "@/app/lib/i18n/client";

function StatusScreen({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-sm text-fg-2">{children}</p>
      <Link href="/" className={`${btn.secondary} ${btn.md} mt-4`}>
        {t("На главную")}
      </Link>
    </div>
  );
}

export default function Profile() {
  const t = useT();
  const profile = useProfilePage();
  const {
    username,
    data,
    loading,
    setShowWrapped,
    isMyProfile,
    isLogged,
    countries,
    error,
    handleShowCompatibility,
    mood,
    wsRef,
    handleFollow,
    openFollowModal,
    importLoading,
    handleLastfmImport,
  } = profile;

  if (error)
    return (
      <StatusScreen title={t("Профиль не найден")}>
        {t("Пользователя")}{" "}
        <span className="font-mono text-fg">@{username}</span>{" "}
        {t("нет в нашей базе.")}
      </StatusScreen>
    );

  if (loading || !data.user) return <Loading label={t("Загружаем профиль…")} />;

  const u = data.user;
  const fallbackAvatar = `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`;

  const totalXp = data.stats.total_xp || data.stats.total_scrobbles || 0;
  const currentLevel = Math.floor(totalXp / 100) + 1;
  const xpInCurrentLevel = totalXp % 100;
  const progressPercent = (xpInCurrentLevel / 100) * 100;

  const rank = getRankInfo(currentLevel);
  const nextRank = getNextRankInfo(currentLevel);

  let socialLinks = [];
  try {
    socialLinks = JSON.parse(u.social_links || "[]");
  } catch (e) {
    console.error(e);
  }

  if (u.is_private && !u.can_view_private)
    return (
      <StatusScreen title={t("Это приватный профиль")}>
        {t(
          "Пользователь ограничил доступ к своей статистике и истории прослушиваний.",
        )}
      </StatusScreen>
    );

  const favoriteArtistQuery = u.favorite_artist ? `${u.favorite_artist} ` : "";
  const favoriteAlbumSearchQuery =
    `${favoriteArtistQuery}${u.favorite_album || ""}`.trim();
  const favoriteAlbumRedirectUrl =
    u.favorite_album_url && u.favorite_album_url !== "#"
      ? u.favorite_album_url
      : `${API_URL}/api/redirect?source=yandex&type=album&q=${encodeURIComponent(favoriteAlbumSearchQuery)}`;

  const displayedAchs =
    u.achievements?.filter((a) => a.is_displayed !== false) || [];
  const hiddenSections = new Set(u.preferences?.profile.hidden_sections ?? []);

  const view = {
    ...profile,
    u,
    fallbackAvatar,
    totalXp,
    currentLevel,
    xpInCurrentLevel,
    progressPercent,
    rank,
    nextRank,
    socialLinks,
    favoriteArtistQuery,
    favoriteAlbumSearchQuery,
    favoriteAlbumRedirectUrl,
    displayedAchs,
  };

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-10 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <ProfileToasts {...view} />
      <WrappedModal {...view} />
      <ImportConfirmModal {...view} />
      <FollowModal {...view} />
      <CompatibilityModal {...view} />

      <div
        aria-hidden="true"
        className="relative -mb-4 h-40 overflow-hidden rounded-2xl border border-line-soft bg-[radial-gradient(circle_at_20%_10%,var(--accent-glow-strong),transparent_55%),linear-gradient(135deg,var(--color-surface-2),var(--color-bg))] sm:h-52 md:h-64"
      >
        {sanitizeImageUrl(u.cover_url) && (
          <img
            src={sanitizeImageUrl(u.cover_url)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-bg/80 via-bg/10 to-transparent" />
      </div>

      <ProfileHeaderSection
        u={u}
        username={username as string}
        fallbackAvatar={fallbackAvatar}
        currentLevel={currentLevel}
        rankTitle={rank.title}
        mood={mood}
        followers={data.followStats.followers}
        following={data.followStats.following}
        openFollowModal={openFollowModal}
        xpInCurrentLevel={xpInCurrentLevel}
        nextRank={nextRank}
        totalScrobbles={data.stats.total_scrobbles || 0}
        actions={
          <ProfileActions
            isLogged={isLogged}
            isMyProfile={isMyProfile}
            isFollowing={data.followStats.is_following}
            hasImportedLastfm={Boolean(data.user?.has_imported_lastfm)}
            username={username as string}
            importLoading={importLoading}
            onFollow={handleFollow}
            onImport={handleLastfmImport}
            onShowWrapped={() => setShowWrapped(true)}
            onListenTogether={() =>
              wsRef.current?.send(
                JSON.stringify({ type: "SYNC_REQUEST", target: username }),
              )
            }
            onShowCompatibility={handleShowCompatibility}
          />
        }
        hasBanner
      />

      <NowPlaying
        username={String(username)}
        variant="profile"
        live={isMyProfile}
      />

      <ProfileStatsSection
        u={u}
        taste={data.taste}
        socialLinks={socialLinks}
        countries={countries}
        favoriteAlbumRedirectUrl={favoriteAlbumRedirectUrl}
        showShowcase={!hiddenSections.has("showcase")}
      />

      {!hiddenSections.has("top_artists") &&
        (data.stats.top_artists ?? []).length > 0 && (
          <section aria-label={t("Любимые исполнители")} className="space-y-3">
            <h2 className="text-lg font-semibold">{t("Чаще всего звучат")}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {(data.stats.top_artists ?? []).slice(0, 3).map((artist) => {
                const cover = sanitizeImageUrl(
                  data.stats.top_tracks?.find(
                    (track) => track.artist === artist.artist,
                  )?.cover_url,
                );
                return (
                  <div
                    key={artist.artist}
                    className="flex min-w-0 items-center gap-3 rounded-xl bg-surface p-4"
                  >
                    {cover ? (
                      <img
                        src={coverAt(cover, 48)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="h-12 w-12 shrink-0 rounded-lg bg-surface-2" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {artist.artist}
                      </p>
                      <p className="text-xs text-fg-2">
                        {t("{n} прослушиваний", {
                          n: formatNumber(artist.plays),
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      <ProfileMainGrid {...view} />
      <ProfileAchievements
        username={String(username)}
        displayedAchs={displayedAchs}
        total={u.achievements?.length ?? 0}
      />
    </div>
  );
}
