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
import { Loading, btn } from "@/components/ui";
import { getRankInfo, getNextRankInfo } from "@/app/lib/ranks";
import { ProfileActions } from "./_components/ProfileActions";
import { ProfileHeaderSection } from "./_components/ProfileHeaderSection";
import { ProfileStatsSection } from "./_components/ProfileStatsSection";
import { ProfileToasts } from "./_components/ProfileToasts";
import { WrappedModal } from "./_components/WrappedModal";
import { ImportConfirmModal } from "./_components/ImportConfirmModal";
import { FollowModal } from "./_components/FollowModal";
import { CompatibilityModal } from "./_components/CompatibilityModal";
import { ProfileMainGrid } from "./_components/ProfileMainGrid";
import { useProfilePage } from "./_components/useProfilePage";

function StatusScreen({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-sm text-fg-2">{children}</p>
      <Link href="/" className={`${btn.secondary} ${btn.md} mt-4`}>
        На главную
      </Link>
    </div>
  );
}

export default function Profile() {
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
      <StatusScreen title="Профиль не найден">
        Пользователя <span className="font-mono text-fg">@{username}</span> нет
        в нашей базе.
      </StatusScreen>
    );

  if (loading || !data.user) return <Loading label="Загружаем профиль…" />;

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

  if (u.is_private)
    return (
      <StatusScreen title="Это приватный профиль">
        Пользователь ограничил доступ к своей статистике и истории
        прослушиваний.
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

      {u.cover_url && (
        <div
          aria-hidden="true"
          className="-mb-4 h-32 rounded-xl bg-surface bg-cover bg-center md:h-44"
          style={{ backgroundImage: `url(${u.cover_url})` }}
        />
      )}

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
        displayedAchs={displayedAchs}
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
      />

      <ProfileStatsSection
        u={u}
        taste={data.taste}
        socialLinks={socialLinks}
        countries={countries}
        favoriteAlbumRedirectUrl={favoriteAlbumRedirectUrl}
      />

      <ProfileMainGrid {...view} />
    </div>
  );
}
