/**
 * User Profile Page
 * -----------------
 * Публичная страница профиля пользователя.
 * Отображает: аватар, статистику, уровни, достижения и 
 * премиальные карточки локации/жанров/аппаратуры.
 */
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRankInfo, getNextRankInfo, LvlBadge, VerifiedBadge } from '../../Navbar';

const LiveTimer = ({ listenedSec, isPlaying, updatedAt }: any) => {
  const [elapsed, setElapsed] = useState(listenedSec);

  useEffect(() => {
    setElapsed(listenedSec);
    if (!isPlaying) return;

    const updateTime = new Date(updatedAt + 'Z').getTime();
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - updateTime) / 1000);
      setElapsed(listenedSec + (diff > 0 ? diff : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [listenedSec, isPlaying, updatedAt]);

  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return (
    <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded shadow-[0_0_5px_var(--accent-glow)] ${isPlaying ? 'bg-[var(--accent)]/20 text-[var(--accent-text)]' : 'bg-gray-500/20 text-gray-400'}`}>
      {m}:{s}
    </span>
  );
};

const getPlatformIcon = (source: string) => {
  switch (source) {
    case 'spotify':
      return <svg viewBox="0 0 24 24" fill="#1DB954" className="w-4 h-4 shrink-0 shadow-[0_0_5px_rgba(29,185,84,0.5)] rounded-full"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.66.3 1.02zm1.44-3.3c-.301.42-.84.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.32-1.38 9.72-.72 13.44 1.56.42.24.6.84.3 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.18-1.2-.18-1.38-.781-.18-.6.18-1.2.78-1.38 4.2-1.26 11.28-1.02 15.72 1.62.539.3.719 1.02.419 1.56-.239.54-.959.72-1.619.36z" /></svg>;
    case 'youtube_music':
      return <img src="https://img.icons8.com/?size=100&id=V1cbDThDpbRc&format=png&color=FF0000" alt="YouTube Music" className="w-4 h-4 shrink-0 object-contain drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]" />;
    case 'vk':
      return <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 drop-shadow-[0_0_5px_rgba(0,0,0,0.5)]"><rect width="24" height="24" rx="5.5" fill="#000" /><path fill="#fff" d="M15.5 17c-5.5 0-8.6-3.8-8.7-10h2.7c.1 4.5 2.1 6.4 3.7 6.8V7h2.5v3.9c1.5-.2 3.1-1.9 3.6-3.9h2.5c-.4 2.5-2.2 4.2-3.5 5 1.3.6 3.4 2 4.2 5h-2.8c-.6-2-2.2-3.5-4.2-3.7V17h-2z" /></svg>;
    case 'soundcloud':
      return <img src="https://img.icons8.com/?size=100&id=13669&format=png&color=FF5500" alt="SoundCloud" className="w-4 h-4 shrink-0 object-contain drop-shadow-[0_0_5px_rgba(255,85,0,0.5)]" />;
    case 'apple_music':
      return <img src="https://img.icons8.com/?size=100&id=81TSi6Gqk0tm&format=png&color=FA243C" alt="Apple Music" className="w-4 h-4 shrink-0 object-contain drop-shadow-[0_0_5px_rgba(250,36,60,0.5)]" />;
    case 'yandex':
      return <img src="/yandex.png" alt="Яндекс" className="w-4 h-4 shrink-0 object-contain drop-shadow-[0_0_5px_var(--accent-glow)]" />;
    default:
      return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0 text-gray-400 drop-shadow-[0_0_5px_rgba(156,163,175,0.5)]"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>;
  }
};

const getArtistUrl = (artist: string, source: string) => {
  if (!artist) return '#';
  const q = encodeURIComponent(artist);
  switch (source) {
    case 'spotify': return `https://open.spotify.com/search/${q}/artists`;
    case 'vk': return `https://vk.com/audio?q=${q}`;
    case 'youtube_music': return `https://music.youtube.com/search?q=${q}`;
    case 'soundcloud': return `https://soundcloud.com/search/people?q=${q}`;
    case 'apple_music': return `https://music.apple.com/search?term=${q}`;
    case 'yandex': return `http://127.0.0.1:8000/api/redirect?source=yandex&type=artist&q=${q}`;
    default: return '#';
  }
};

const getTrackUrl = (t: any) => {
  if (t.source === 'yandex' && (!t.track_url || !t.track_url.includes('/track/'))) {
    return `http://127.0.0.1:8000/api/redirect?source=yandex&type=track&q=${encodeURIComponent(t.artist + ' ' + (t.title || ''))}`;
  }
  return t.track_url || '#';
};

const SocialIcons = {
  telegram: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.892-.661 3.495-1.524 5.83-2.529 7.005-3.017 3.332-1.392 4.02-1.631 4.464-1.639z" /></svg>,
  vk: <svg viewBox="0 0 24 24" className="w-5 h-5"><rect width="24" height="24" rx="5.5" fill="#000" /><path fill="#fff" d="M15.5 17c-5.5 0-8.6-3.8-8.7-10h2.7c.1 4.5 2.1 6.4 3.7 6.8V7h2.5v3.9c1.5-.2 3.1-1.9 3.6-3.9h2.5c-.4 2.5-2.2 4.2-3.5 5 1.3.6 3.4 2 4.2 5h-2.8c-.6-2-2.2-3.5-4.2-3.7V17h-2z" /></svg>,
  steam: <img src="https://www.svgrepo.com/show/473800/steam.svg" alt="Steam" className="w-5 h-5 brightness-0 invert group-hover:invert-0 transition-all duration-200" />,
  github: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12z" /></svg>,
  instagram: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
};

export default function Profile() {
  const username = useParams()?.username;
  const router = useRouter();

  const [data, setData] = useState<any>({
    history: [], stats: {},
    user: null, taste: null, followStats: { followers: 0, following: 0, is_following: false }
  });
  const [loading, setLoading] = useState(true);
  const [showWrapped, setShowWrapped] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);
  const [followModal, setFollowModal] = useState<any>({ isOpen: false, type: '', title: '', users: [], loading: false });
  const [isMyProfile, setIsMyProfile] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [countries, setCountries] = useState<any[]>([]);

  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name,translations,cca2,flag')
      .then(r => r.json())
      .then(d => { 
          if (Array.isArray(d)) {
              const list = d.map((c: any) => ({
                  name: c.translations?.rus?.common || c.name.common,
                  code: c.cca2,
                  flag: c.flag
              }));
              setCountries(list);
          }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsMyProfile(localStorage.getItem('username') === username);
    setIsLogged(!!localStorage.getItem('username'));
  }, [username]);

  useEffect(() => {
    if (!username) return;

    const fetchAllData = async () => {
      try {
        const viewer = localStorage.getItem('username') || 'null';
        const ts = Date.now();
        const [hRes, sRes, uRes, fRes, tRes] = await Promise.all([
          fetch(`http://127.0.0.1:8000/api/history/${username}?t=${ts}`).then(r => r.ok ? r.json() : { history: [] }),
          fetch(`http://127.0.0.1:8000/api/stats/${username}?t=${ts}`).then(r => r.ok ? r.json() : {}),
          fetch(`http://127.0.0.1:8000/api/user/${username}?t=${ts}`).then(r => r.ok ? r.json() : null),
          fetch(`http://127.0.0.1:8000/api/follow-stats/${username}?t=${ts}`).then(r => r.ok ? r.json() : null),
          viewer !== 'null' && viewer !== username ? fetch(`http://127.0.0.1:8000/api/taste-match/${viewer}/${username}?t=${ts}`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
        ]);

        setData({
          history: hRes.history || [], stats: sRes || {}, user: uRes || null,
          taste: tRes,
          followStats: fRes || { followers: 0, following: 0, is_following: false }
        });
      } catch (err) {
        console.error("Ошибка загрузки профиля:", err);
      } finally {
        setLoading(false);
      }
    };

    const checkNotifications = async () => {
      if (!isMyProfile) return;
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/notifications/${username}`);
        if (res.ok) {
          const unread = await res.json();
          if (unread.length > 0) {
            setToasts((prev: any[]) => {
              const newToasts = [...prev];
              unread.forEach((ach: any) => {
                if (!newToasts.some((t: any) => t.ach_id === ach.ua_id)) {
                  const toastId = ach.ua_id + '-' + Date.now() + '-' + Math.random();
                  newToasts.push({
                    id: toastId,
                    ach_id: ach.ua_id,
                    name: ach.name,
                    icon: ach.icon,
                    xp: ach.reward_xp,
                    image: ach.target_image
                  });
                  // Самоуничтожение тоста
                  setTimeout(() => {
                    setToasts((current: any[]) => current.filter((t: any) => t.id !== toastId));
                  }, 6000);
                }
              });
              return newToasts;
            });

            await fetch(`http://127.0.0.1:8000/api/notifications/${username}/read`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ua_ids: unread.map((d: any) => d.ua_id) })
            });
          }
        }
      } catch (e) { }
    };

    let isSubscribed = true;
    let timeoutId: NodeJS.Timeout;

    const pollData = async () => {
      if (!isSubscribed) return;
      await Promise.allSettled([fetchAllData(), checkNotifications()]);
      if (isSubscribed) {
        timeoutId = setTimeout(pollData, 800); // Поллинг с паузой вместо глупого setInterval
      }
    };

    pollData();

    return () => {
      isSubscribed = false;
      clearTimeout(timeoutId);
    };
  }, [username, isMyProfile]);

  useEffect(() => {
    if (data.user?.theme) {
      (window as any).__ACTIVE_PROFILE_THEME__ = data.user.theme;
      window.dispatchEvent(new Event('theme_update'));
    }
    return () => {
      delete (window as any).__ACTIVE_PROFILE_THEME__;
      window.dispatchEvent(new Event('theme_update'));
    };
  }, [data.user?.theme]);

  // Таймеры для уведомлений теперь создаются индивидуально при их добавлении

  const handleFollow = async () => {
    const apiKey = localStorage.getItem('apiKey');
    if (!apiKey) return router.push('/auth');
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/follow/${username}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey })
      });
      if (res.ok) {
        const result = await res.json();
        setData((prev: any) => ({
          ...prev, followStats: { ...prev.followStats, is_following: result.status === 'followed', followers: prev.followStats.followers + (result.status === 'followed' ? 1 : -1) }
        }));
      }
    } catch (err) { }
  };

  const openFollowModal = async (type: string) => {
    setFollowModal({ isOpen: true, type, title: type === 'followers' ? 'Подписчики' : 'Подписки', users: [], loading: true });
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/${type}/${username}`);
      if (res.ok) {
        const fetchedUsers = await res.json();
        setFollowModal((prev: any) => ({ ...prev, users: fetchedUsers, loading: false }));
      }
    } catch (err) {
      setFollowModal((prev: any) => ({ ...prev, loading: false }));
    }
  };

  if (loading || !data.user) return <div className="min-h-screen text-[var(--accent-text)] flex items-center justify-center font-bold text-2xl animate-pulse">Подключение к базе...</div>;

  const u = data.user;
  const fallbackAvatar = `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`;

  const totalXp = data.stats.total_xp || data.stats.total_scrobbles || 0;
  const currentLevel = Math.floor(totalXp / 100) + 1;
  const xpInCurrentLevel = totalXp % 100;
  const progressPercent = (xpInCurrentLevel / 100) * 100;

  const rank = getRankInfo(currentLevel);
  const nextRank = getNextRankInfo(currentLevel);

  let socialLinks = [];
  try { socialLinks = JSON.parse(u.social_links || "[]"); } catch (e) { }

  const displayedAchs = u.achievements?.filter((a: any) => a.is_displayed !== false) || [];

  return (
    <div className="max-w-6xl mx-auto relative px-4 md:px-0">
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
      `}</style>
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-[#121212]/95 backdrop-blur-md border border-[var(--accent)]/50 p-4 rounded-xl shadow-[0_0_30px_var(--accent-glow)] flex items-center gap-4 w-80 pointer-events-auto relative overflow-hidden transition-all duration-300">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-hover)]"></div>
            <div className="w-14 h-14 bg-black rounded-lg flex items-center justify-center text-3xl shrink-0 overflow-hidden border border-white/10 shadow-inner">
              {t.image ? <img src={t.image} className="w-full h-full object-cover" /> : t.icon}
            </div>
            <div className="flex-grow">
              <div className="text-[10px] text-[var(--accent-text)] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Достижение получено!
              </div>
              <div className="text-white font-black text-sm leading-tight">{t.name}</div>
              {t.xp > 0 && <div className="text-emerald-400 font-mono text-[11px] font-bold mt-1 bg-emerald-500/10 px-1.5 py-0.5 inline-block rounded">+{t.xp} XP</div>}
            </div>
            <button onClick={() => setToasts((prev: any[]) => prev.filter((toast: any) => toast.id !== t.id))} className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        ))}
      </div>

      {showWrapped && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowWrapped(false)}>
          <div className="bg-[#1a1a1a] rounded-2xl w-[400px] h-[600px] shadow-2xl overflow-hidden relative border border-white/10 p-6 flex flex-col justify-between" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[var(--accent)]/20 to-transparent opacity-50 z-0 pointer-events-none"></div>
            <div className="z-10 text-center relative">
              <div className={`w-24 h-24 mx-auto bg-[#333] rounded-full overflow-hidden border-4 border-[var(--accent)] shadow-[0_0_20px_var(--accent-glow)] mb-4`}>
                <img src={u.avatar_url || fallbackAvatar} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = fallbackAvatar; }} />
              </div>
              <h2 className="text-3xl font-black text-white flex items-center justify-center">{u.display_name} <VerifiedBadge role={u.role} isVerified={u.is_verified} /></h2>
              <p className="text-[var(--accent-text)] font-bold mt-1">@VEIN Music</p>
            </div>
            <div className="z-10 bg-[#121212]/80 p-4 rounded-xl border border-white/5 backdrop-blur-md">
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">Любимые артисты</h3>
              {data.stats.top_artists?.slice(0, 3).map((a: any, i: number) => (
                <div key={i} className="flex justify-between items-center mb-2 border-l-2 border-[var(--accent)] pl-2">
                  <span className="font-bold truncate text-sm text-white">{a.artist}</span>
                  <span className="text-xs text-gray-400 shrink-0">{a.plays} plays</span>
                </div>
              ))}
            </div>
            <div className="z-10 text-center text-xs text-gray-500 mt-4">
              Сделай скриншот и закинь в сторис! <br />
              <button onClick={() => setShowWrapped(false)} className="text-[var(--accent-text)] mt-2 hover:underline font-bold">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {followModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setFollowModal({ isOpen: false, type: '', title: '', users: [], loading: false })}>
          <div className="bg-[#1a1a1a] rounded-2xl w-[400px] max-h-[80vh] shadow-2xl overflow-hidden relative border border-white/10 p-0 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#121212]">
              <h3 className="text-lg font-black text-[var(--accent-text)] uppercase tracking-wider">{followModal.title}</h3>
              <button onClick={() => setFollowModal({ isOpen: false, type: '', title: '', users: [], loading: false })} className="text-gray-500 hover:text-white transition-colors text-xl font-black">✕</button>
            </div>
            <div className="overflow-y-auto p-2 custom-scrollbar flex-grow bg-[#121212]/50 backdrop-blur-sm">
              {followModal.loading ? (
                <div className="text-center text-[var(--accent-text)] py-10 font-bold animate-pulse">Загрузка...</div>
              ) : followModal.users.length === 0 ? (
                <div className="text-center text-gray-500 py-10 font-medium">Тут пока пусто.</div>
              ) : (
                <ul className="space-y-1">
                  {followModal.users.map((followerUser: any, idx: number) => (
                    <li key={idx} onClick={() => { setFollowModal({ isOpen: false, type: '', title: '', users: [], loading: false }); router.push(`/user/${followerUser.username}`); }} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors group border border-transparent hover:border-white/5">
                      <img src={followerUser.avatar_url || `https://api.dicebear.com/9.x/micah/svg?seed=${followerUser.username}&backgroundColor=transparent`} className="w-10 h-10 rounded-full bg-black object-cover shrink-0 border border-white/10" onError={(e) => { e.currentTarget.src = `https://api.dicebear.com/9.x/micah/svg?seed=${followerUser.username}&backgroundColor=transparent`; }} />
                      <div className="truncate flex-grow">
                        <div className="font-bold text-white text-sm truncate flex items-center gap-1 group-hover:text-[var(--accent-text)] transition-colors">
                          {followerUser.display_name}
                          <VerifiedBadge role={followerUser.role} isVerified={followerUser.is_verified} sizeClass="w-3.5 h-3.5" />
                          <LvlBadge level={followerUser.level} />
                        </div>
                        <div className="text-xs text-gray-500 truncate">@{followerUser.username}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-4 mb-4 pt-4">
        {isLogged && !isMyProfile && (
          <button
            onClick={handleFollow}
            className={`px-5 py-2.5 text-sm rounded-lg font-black transition-all flex items-center gap-2 ${data.followStats.is_following ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] shadow-[0_0_15px_var(--accent-glow)] hover:scale-105'}`}
          >
            {data.followStats.is_following ? 'Отписаться' : 'Подписаться'}
          </button>
        )}
        <button onClick={() => router.push(`/user/${username}/stats`)} className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold">
          📊 Подробная статистика
        </button>
        <button onClick={() => setShowWrapped(true)} className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold">
          📸 Поделиться
        </button>
        {isMyProfile && (
          <button onClick={() => router.push('/settings')} className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold">
            ⚙️ Настройки
          </button>
        )}
      </div>

      <div className="rounded-2xl shadow-2xl border border-white/5 relative mb-12 bg-[#121212]/80 backdrop-blur-md">
        {/* Блок Обложки (чистый баннер без затемнений текста) */}
        <div className="w-full h-40 md:h-64 rounded-t-2xl relative overflow-hidden bg-[#1a1a1a]">
          {u.cover_url ? (
             <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${u.cover_url})` }}></div>
          ) : (
             <div className="absolute inset-0 bg-gradient-to-br from-[#282828] to-[#1e1e1e]"></div>
          )}
          {/* Очень легкий градиент внизу баннера для слияния, не мешающий картинке */}
          <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[rgba(18,18,18,0.9)] to-transparent pointer-events-none"></div>
        </div>

        {/* Блок Контента (Аватар + Имя + Инфа) */}
        <div className="px-6 md:px-10 pb-8 pt-0 flex flex-col md:flex-row items-center md:items-start md:gap-8 relative z-10">
          
          <div className="relative shrink-0 z-20 -mt-20 md:-mt-24 mb-4 md:mb-0 group flex flex-col items-center">
            {/* Пульсирующая рамка/свечение */}
            <div className="absolute top-0 rounded-full w-32 h-32 md:w-40 md:h-40 bg-[var(--accent)] shadow-[0_0_40px_var(--accent-glow)] blur-lg animate-pulse opacity-40"></div>

            <div className={`relative w-32 h-32 md:w-40 md:h-40 bg-[#1e1e1e] rounded-full overflow-hidden border-[6px] border-[#121212] shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition-all duration-500 z-10 group-hover:border-[#1a1a1a]`}>
              <img src={u.avatar_url || fallbackAvatar} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={e => e.currentTarget.src = fallbackAvatar} />
            </div>
            {/* Лэвел Бейдж */}
            <div className={`relative -mt-4 bg-[#121212] border-2 border-[var(--accent)] text-gray-200 px-4 py-1.5 rounded-full text-[11px] md:text-xs font-black shadow-xl whitespace-nowrap flex items-center gap-2 z-20`}>
              <span>LVL {currentLevel}</span> <span className="opacity-50">|</span> <span className="uppercase tracking-widest">{rank.title}</span>
            </div>
          </div>

          <div className="text-center md:text-left z-10 flex-grow w-full md:pt-4 min-w-0">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-wide mb-1 flex items-center justify-center md:justify-start">
            {u.display_name} <VerifiedBadge role={u.role} isVerified={u.is_verified} sizeClass="w-8 h-8 md:w-10 md:h-10" />
          </h1>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
            <p className="text-[var(--accent-text)] font-bold text-sm">@{username}</p>

            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 bg-black/50 px-2 py-1 rounded-md border border-white/5">
              <span onClick={() => openFollowModal('followers')} className="hover:text-white transition-colors cursor-pointer" title="Посмотреть подписчиков">{data.followStats.followers} подписчиков</span>
              <span>•</span>
              <span onClick={() => openFollowModal('following')} className="hover:text-white transition-colors cursor-pointer" title="Посмотреть подписки">{data.followStats.following} подписок</span>
            </div>

            {u.streak > 0 && (
              <div className={`flex items-center gap-1 text-xs font-black px-2 py-1 rounded-md border transition-all ${u.streak >= 7 ? 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse' : 'bg-[#121212]/80 text-orange-500 border-orange-500/20'}`} title="Дней подряд (минимум 5 треков в день)">
                <span className="animate-fire">🔥</span> {u.streak}
              </div>
            )}
          </div>

          <p className="text-gray-300 italic max-w-2xl bg-[#121212]/60 p-4 rounded-lg border-l-2 border-[var(--accent)] mb-4 shadow-inner">{u.bio}</p>

          <div className="mb-6 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 relative">
              {displayedAchs.map((a: any) => (
                <div key={a.id} className="group relative flex items-center gap-2 bg-[#121212]/80 px-3 py-1.5 rounded-lg border border-white/5 hover:border-[var(--accent)] transition-all cursor-help shadow-md hover:shadow-[0_0_15px_var(--accent-glow)]">
                  {a.target_image ? (
                    <img src={a.target_image} alt={a.name} className="w-7 h-7 rounded object-cover shadow-[0_0_8px_var(--accent-glow)] group-hover:scale-110 transition-transform shrink-0" />
                  ) : (
                    <span className="text-2xl drop-shadow-[0_0_8px_var(--accent-glow)] group-hover:scale-110 transition-transform">{a.icon}</span>
                  )}
                  <span className="text-xs font-black text-white uppercase tracking-wider leading-none group-hover:text-[var(--accent-text)] transition-colors">{a.name}</span>

                  <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-max max-w-[280px] bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 p-2.5 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    {a.rule_target && a.rule_target.startsWith('http') ? (
                      <a href={a.rule_target} target="_blank" rel="noreferrer" className="flex items-center gap-3 group/link">
                        {a.target_image && (
                          <img src={a.target_image} className="w-10 h-10 rounded object-cover shadow-md shrink-0 border border-white/5 group-hover/link:border-[var(--accent)] transition-colors" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
                        <div className="flex flex-col text-left">
                          <span className="text-sm font-bold text-white group-hover/link:text-[var(--accent-text)] transition-colors leading-tight mb-0.5">{a.name}</span>
                          <span className="text-[10px] text-gray-300 font-medium leading-snug whitespace-normal">{a.description}</span>
                          {a.reward_xp > 0 && <span className="text-[10px] text-emerald-400 font-mono mt-1 font-bold">+{a.reward_xp} XP</span>}
                        </div>
                      </a>
                    ) : (
                      <div className="flex items-center gap-3">
                        {a.target_image && (
                          <img src={a.target_image} className="w-10 h-10 rounded object-cover shadow-md shrink-0 border border-white/5" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
                        <div className="flex flex-col text-left">
                          <span className="text-sm font-bold text-white leading-tight mb-0.5">{a.name}</span>
                          <span className="text-[10px] text-gray-300 font-medium leading-snug whitespace-normal">{a.description}</span>
                          {a.reward_xp > 0 && <span className="text-[10px] text-emerald-400 font-mono mt-1 font-bold">+{a.reward_xp} XP</span>}
                        </div>
                      </div>
                    )}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#1a1a1a]/95"></div>
                  </div>
                </div>
              ))}

              {u.achievements?.length > 0 && (
                <button onClick={() => router.push(`/user/${username}/achievements`)} className="bg-[#121212]/80 hover:bg-white/10 text-[10px] font-bold text-gray-400 px-3 py-2 rounded-lg transition-colors border border-white/5 uppercase tracking-widest ml-2">
                  Все достижения
                </button>
              )}
            </div>
          </div>

          <div className="max-w-md bg-[#121212]/50 p-3 rounded-xl border border-white/5 backdrop-blur-sm mb-5 shadow-lg mx-auto md:mx-0">
            <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">
              <span className="flex items-center gap-1">{nextRank ? <>До ранга <span className="text-[var(--accent)]">{nextRank.name}</span></> : 'Максимальный ранг'}</span>
              <span>
                {xpInCurrentLevel} / 100 XP
                {u.streak >= 7 && <span className="text-orange-400 ml-1 font-black" title="Стрик 7+ дней дает +10% опыта!"><span className="animate-fire">🔥</span> +10%</span>}
              </span>
            </div>
            <div className="w-full bg-black/80 h-3 rounded-full overflow-hidden border border-white/10">
              <div className={`bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow-strong)] h-full relative transition-all duration-1000`} style={{ width: `${progressPercent}%` }}>
                <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
              </div>
            </div>
          </div>

          {data.taste && data.taste.match !== undefined && (
            <div className="inline-flex items-center gap-3 bg-[#1DB954]/10 border border-[#1DB954]/40 px-4 py-2 rounded-lg mb-5 shadow-lg backdrop-blur-sm hover:scale-105 transition-transform">
              <span className="text-2xl drop-shadow-[0_0_5px_#1DB954] animate-fire">🔥</span>
              <div className="text-left">
                <p className="text-[10px] text-[#1DB954] font-bold uppercase tracking-wider">Совместимость вкусов</p>
                <p className="text-white font-bold text-sm">
                  {data.taste.match}%
                  <span className="text-gray-400 font-normal text-xs ml-1">
                    ({data.taste.common_artists?.length > 0 ? data.taste.common_artists.join(', ') : 'пока нет общих'})
                  </span>
                </p>
              </div>
            </div>
          )}

          {socialLinks.length > 0 && (
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-6">
              {socialLinks.map((link: any) => (
                <a key={link.id} href={link.network.toLowerCase() === 'telegram' ? `https://t.me/${link.username}` : `https://${link.network}.com/${link.username}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-[#121212]/50 hover:bg-[var(--accent)] hover:text-[var(--text-on-accent)] text-white px-4 py-2 rounded-lg text-sm transition-all border border-white/5 hover:border-transparent backdrop-blur-sm shadow-md group">
                  {SocialIcons[link.network as keyof typeof SocialIcons]}
                  <span className="font-bold">{link.network}</span>
                </a>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-8">
            {u.location && (() => {
                const parts = u.location.split(',').map((s: string) => s.trim());
                const countryName = parts[0] || '';
                const cityName = parts[1] || '';
                const countryInfo = countries.find(c => c.name.toLowerCase() === countryName.toLowerCase());
                const flag = countryInfo ? countryInfo.flag : '📍';
                
                return (
                  <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
                    <span className="text-2xl drop-shadow-md group-hover:scale-110 transition-transform">{flag}</span>
                    <div className="flex flex-col text-left">
                       <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">Местоположение</span>
                       <span className="text-sm font-bold text-white leading-none tracking-wide">
                         {countryName}{cityName ? `, ${cityName}` : ''}
                       </span>
                    </div>
                  </div>
                );
            })()}
            {u.favorite_genre && (
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
                <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">🎧</span>
                <div className="flex flex-col text-left">
                   <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">Жанр</span>
                   <span className="text-sm font-bold text-white leading-none tracking-wide">{u.favorite_genre}</span>
                </div>
              </div>
            )}
            {u.equipment && (
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
                <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">🔊</span>
                <div className="flex flex-col text-left">
                   <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">Аппаратура</span>
                   <span className="text-sm font-bold text-white leading-none tracking-wide">{u.equipment}</span>
                </div>
              </div>
            )}
          </div>

          {(u.favorite_artist || u.favorite_track || u.favorite_album) && (
            <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-4">

              {u.favorite_artist && (
                <a href={u.favorite_artist_url || '#'} target="_blank" rel="noreferrer" className="bg-[#121212]/80 p-3 pr-6 rounded-xl border border-white/5 hover:border-[var(--accent)] group transition-all shadow-md flex items-center gap-4 w-max max-w-full">
                  <img src={u.favorite_artist_cover || "https://placehold.co/100x100/282828/ffcc00?text=🎤"} className="w-14 h-14 rounded-full object-cover group-hover:scale-110 transition-transform duration-500 shadow-inner shrink-0" onError={(e) => { e.currentTarget.src = "https://placehold.co/100x100/282828/ffcc00?text=🎤"; }} />
                  <div className="text-left flex flex-col justify-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Любимый артист</p>
                    <p className="font-black text-white group-hover:text-[var(--accent-text)] text-sm transition-colors whitespace-nowrap pr-4">{u.favorite_artist}</p>
                  </div>
                </a>
              )}

              {u.favorite_track && (
                <a href={u.favorite_track_url || '#'} target="_blank" rel="noreferrer" className="bg-[#121212]/80 p-3 pr-6 rounded-xl border border-white/5 hover:border-[var(--accent)] group transition-all shadow-md flex items-center gap-4 w-max max-w-full">
                  <img src={u.favorite_track_cover || "https://placehold.co/100x100/282828/ffcc00?text=🎵"} className="w-14 h-14 rounded object-cover group-hover:scale-110 transition-transform duration-500 shadow-inner shrink-0" onError={(e) => { e.currentTarget.src = "https://placehold.co/100x100/282828/ffcc00?text=🎵"; }} />
                  <div className="text-left flex flex-col justify-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Любимый трек</p>
                    <p className="font-black text-white group-hover:text-[var(--accent-text)] text-sm transition-colors whitespace-nowrap pr-4">{u.favorite_track}</p>
                  </div>
                </a>
              )}

              {u.favorite_album && (
                <a href={u.favorite_album_url || '#'} target="_blank" rel="noreferrer" className="bg-[#121212]/80 p-3 pr-6 rounded-xl border border-white/5 hover:border-[var(--accent)] group transition-all shadow-md flex items-center gap-4 w-max max-w-full">
                  <img src={u.favorite_album_cover || "https://placehold.co/100x100/282828/ffcc00?text=💿"} className="w-14 h-14 rounded-md object-cover group-hover:scale-110 transition-transform duration-500 shadow-inner shrink-0" onError={(e) => { e.currentTarget.src = "https://placehold.co/100x100/282828/ffcc00?text=💿"; }} />
                  <div className="text-left flex flex-col justify-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Любимый альбом</p>
                    <p className="font-black text-white group-hover:text-[var(--accent-text)] text-sm transition-colors whitespace-nowrap pr-4">{u.favorite_album}</p>
                  </div>
                </a>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-[var(--accent-text)]"><span className="text-2xl">🎵</span> История</h2>
            {data.history.length === 0 ? <p className="text-gray-400 font-medium">Тут пока пусто.</p> : (
              <ul className="space-y-3">
                {data.history.map((item: any, idx: number) => {
                  const isLatest = idx === 0;
                  const isNowPlaying = isLatest && (item.is_playing || (new Date().getTime() - new Date(item.updated_at + 'Z').getTime() < 15 * 60 * 1000));

                  return (
                    <li key={idx} className={`p-3 rounded-xl flex justify-between items-center transition-all duration-300 group relative ${isLatest ? 'bg-gradient-to-r from-white/10 to-transparent border-l-4 border-[var(--accent)] shadow-md' : 'bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/5'}`}>
                      <div className="flex items-center gap-4 pr-2 w-full min-w-0">
                        <div className="w-12 h-12 rounded bg-black shrink-0 overflow-hidden shadow z-10 pointer-events-auto relative">
                          <img src={item.cover_url || "https://placehold.co/100x100/282828/ffcc00?text=🎵"} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col justify-center flex-grow min-w-[0] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          <div className="flex items-center gap-1.5 mb-0.5 w-max">
                            <div className="shrink-0">{getPlatformIcon(item.source)}</div>
                            <a href={getTrackUrl(item)} target="_blank" rel="noreferrer" className={`font-bold text-lg whitespace-nowrap hover:underline hover:text-[var(--accent-text)] transition-colors pointer-events-auto pr-4 ${isLatest ? 'text-[var(--accent-text)]' : 'text-white'}`}>
                              {item.title}
                            </a>
                          </div>

                          <div className="text-gray-300 text-xs whitespace-nowrap pointer-events-auto relative z-10 w-max pr-4">
                            {item.artist.split(',').map((a: string, i: number, arr: string[]) => (
                              <span key={i}>
                                <a href={getArtistUrl(a.trim(), item.source)} target="_blank" rel="noreferrer" className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10 font-medium">
                                  {a.trim()}
                                </a>
                                {i < arr.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>

                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        {isNowPlaying ? (
                          <div className="flex items-center gap-2 bg-[#121212]/80 px-3 py-1.5 rounded-md border border-white/5 shadow-md">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-black uppercase tracking-widest ${item.is_playing ? 'text-[var(--accent-text)]' : 'text-gray-500'}`}>
                                {item.is_playing ? 'Сейчас' : 'Пауза'}
                              </span>
                              <LiveTimer listenedSec={item.listened_sec} isPlaying={item.is_playing} updatedAt={item.updated_at} />
                            </div>
                            <div className="flex items-end gap-[2px] h-3 w-3 ml-1">
                              <div className={`w-[3px] bg-[var(--accent)] h-full rounded-t-sm ${item.is_playing ? 'animate-[bounce_1s_infinite]' : 'opacity-40'}`}></div>
                              <div className={`w-[3px] bg-[var(--accent)] h-2/3 rounded-t-sm ${item.is_playing ? 'animate-[bounce_1s_infinite_0.2s]' : 'opacity-40'}`}></div>
                              <div className={`w-[3px] bg-[var(--accent)] h-4/5 rounded-t-sm ${item.is_playing ? 'animate-[bounce_1s_infinite_0.4s]' : 'opacity-40'}`}></div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <span className="bg-black/50 text-[10px] px-2 py-1 rounded text-gray-300 border border-white/5 font-mono">
                              {new Date(item.time + 'Z').toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {(item.listened_sec || 0) > 0 && (
                              <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider">
                                Прослушано: {Math.floor(item.listened_sec / 60).toString().padStart(2, '0')}:{(item.listened_sec % 60).toString().padStart(2, '0')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-8">

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-[var(--accent-text)]"><span className="text-xl animate-fire">🔥</span> Топ треков</h2>
            <ul className="space-y-3">
              {data.stats.top_tracks?.map((item: any, idx: number) => (
                <li key={idx} className={`p-2 rounded-xl flex gap-3 items-start transition-all border group relative ${item.is_playing ? 'bg-[var(--accent)]/10 border-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/5'}`}>
                  <div className="relative w-10 h-10 rounded bg-[#1a1a1a] shrink-0 overflow-hidden shadow-sm mt-0.5">
                    <img src={item.cover_url || "https://placehold.co/100x100/282828/ffcc00?text=🎵"} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </div>
                  <div className="flex-grow min-w-[0] flex flex-col justify-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="flex items-center gap-2 mb-0.5 w-max">
                      <div className="shrink-0">{getPlatformIcon(item.source)}</div>
                      <a href={getTrackUrl(item)} target="_blank" rel="noreferrer" className="font-bold text-sm text-white hover:text-[var(--accent-text)] hover:underline transition-colors whitespace-nowrap pointer-events-auto pr-4">
                        {item.title}
                      </a>
                    </div>

                    <div className="text-gray-300 text-xs pointer-events-auto whitespace-nowrap pl-[22px] relative z-10 w-max pr-4">
                      {item.artist.split(',').map((a: string, i: number, arr: string[]) => (
                        <span key={i}>
                          <a href={getArtistUrl(a.trim(), item.source)} target="_blank" rel="noreferrer" className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10 font-medium">
                            {a.trim()}
                          </a>
                          {i < arr.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>

                  </div>
                  <span className="text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs font-black shadow-sm shrink-0 mt-1">
                    {item.plays}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-[var(--accent-text)]"><span className="text-xl">🎤</span> Топ артистов</h2>
            <ul className="space-y-3">
              {data.stats.top_artists?.map((item: any, idx: number) => (
                <li key={idx} className="bg-white/5 hover:bg-white/10 p-3 rounded-xl flex justify-between items-start border-l-2 border-[#555] hover:border-[var(--accent)] transition-all group relative">
                  <div className="flex items-center gap-2 min-w-[0] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="shrink-0">{getPlatformIcon(item.source)}</div>
                    <div className="font-bold text-sm text-white pointer-events-auto whitespace-nowrap w-max pr-4">
                      {item.artist.split(',').map((a: string, i: number, arr: string[]) => (
                        <span key={i}>
                          <a href={getArtistUrl(a.trim(), item.source)} target="_blank" rel="noreferrer" className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10">
                            {a.trim()}
                          </a>
                          {i < arr.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs font-black shadow-sm shrink-0 mt-0.5">
                    {item.plays}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}