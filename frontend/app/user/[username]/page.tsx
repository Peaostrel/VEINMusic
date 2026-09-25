/**
 * User Profile Page
 * -----------------
 * Публичная страница профиля пользователя.
 * Отображает: аватар, статистику, уровни, достижения и
 * премиальные карточки локации/жанров/аппаратуры.
 */
"use client";
import { API_URL } from "@/app/lib/api";
import { getRankInfo, getNextRankInfo } from "../../Navbar";
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

export default function Profile() {
  const profile = useProfilePage();
  const {
    username,
    router,
    data,
    loading,
    setShowWrapped,
    isMyProfile,
    isLogged,
    countries,
    accentColor,
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
      <div className="min-h-screen flex flex-col items-center justify-center pt-24 px-4 text-center">
        <div className="text-6xl mb-6">🔍</div>
        <h1 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter">
          Профиль не найден
        </h1>
        <p className="text-gray-400 font-bold max-w-md">
          Пользователя с никнеймом{" "}
          <span className="text-[#ffcc00]">@{username}</span> не существует в
          нашей базе данных.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 bg-white/5 hover:bg-white/10 text-white font-bold px-8 py-3 rounded-xl border border-white/10 transition-all"
        >
          На главную
        </button>
      </div>
    );

  if (loading || !data.user)
    return (
      <div className="min-h-screen text-[var(--accent-text)] flex flex-col items-center justify-center gap-4 font-bold text-2xl animate-pulse">
        <div className="animate-spin border-4 border-[var(--accent-text)] border-t-transparent rounded-full w-12 h-12"></div>
        Подключение к базе...
      </div>
    );

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
      <div className="min-h-screen flex flex-col items-center justify-center pt-24 px-4 text-center">
        <div className="text-6xl mb-6">🔒</div>
        <h1 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter">
          Это приватный профиль
        </h1>
        <p className="text-gray-500 font-bold max-w-md">
          Пользователь ограничил доступ к своей статистике и истории
          прослушиваний.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 bg-white/5 hover:bg-white/10 text-white font-bold px-8 py-3 rounded-xl border border-white/10 transition-all"
        >
          На главную
        </button>
      </div>
    );

  const favoriteArtistQuery = u.favorite_artist ? `${u.favorite_artist} ` : "";
  const favoriteAlbumSearchQuery =
    `${favoriteArtistQuery}${u.favorite_album || ""}`.trim();
  const favoriteAlbumRedirectUrl =
    u.favorite_album_url && u.favorite_album_url !== "#"
      ? u.favorite_album_url
      : `${API_URL}/api/redirect?source=yandex&type=album&q=${encodeURIComponent(favoriteAlbumSearchQuery)}`;

  const displayedAchs =
    u.achievements?.filter((a: any) => a.is_displayed !== false) || [];

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
    <div
      className="max-w-6xl mx-auto relative px-4 md:px-0"
      style={{ "--dynamic-accent": accentColor } as any}
    >
      <style>{`
        @keyframes fireFlicker {
          0%, 100% { transform: scale(1) rotate(-3deg); filter: drop-shadow(0 0 5px rgba(255, 100, 0, 0.4)); }
          50% { transform: scale(1.15) rotate(3deg); filter: drop-shadow(0 0 12px rgba(255, 100, 0, 0.9)); }
        }
        .animate-fire {
          display: inline-block;
          transform-origin: bottom center;
          animation: fireFlicker 1s infinite ease-in-out;
        }
        :root {
          --accent: var(--dynamic-accent, #ffcc00);
        }
      `}</style>
      <ProfileToasts {...view} />

      <WrappedModal {...view} />

      <ImportConfirmModal {...view} />

      <FollowModal {...view} />

      <CompatibilityModal {...view} />

      <ProfileActions
        isLogged={isLogged}
        isMyProfile={isMyProfile}
        isFollowing={data.followStats.is_following}
        hasImportedLastfm={data.has_imported_lastfm}
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
        router={router}
      />

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-center font-bold animate-pulse backdrop-blur-md">
          ⚠️ {error}
        </div>
      )}

      <div className="rounded-2xl shadow-2xl border border-white/5 relative mb-12 bg-[#121212]/80 backdrop-blur-md">
        {/* Блок Обложки (чистый баннер без затемнений текста) */}
        <div className="w-full h-40 md:h-64 rounded-t-2xl relative overflow-hidden bg-[#1a1a1a]">
          {u.cover_url ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${u.cover_url})` }}
            ></div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#282828] to-[#1e1e1e]"></div>
          )}
          {/* Очень легкий градиент внизу баннера для слияния, не мешающий картинке */}
          <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[rgba(18,18,18,0.9)] to-transparent pointer-events-none"></div>
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
          displayedAchs={displayedAchs}
          router={router}
        />

        <ProfileStatsSection
          u={u}
          progressPercent={progressPercent}
          xpInCurrentLevel={xpInCurrentLevel}
          nextRank={nextRank}
          taste={data.taste}
          socialLinks={socialLinks}
          countries={countries}
          favoriteAlbumRedirectUrl={favoriteAlbumRedirectUrl}
        />
      </div>

      <ProfileMainGrid {...view} />
    </div>
  );
}
