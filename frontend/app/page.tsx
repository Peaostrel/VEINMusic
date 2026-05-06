'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Users, ExternalLink } from 'lucide-react';

const getPlatformIcon = (source: string) => {
    switch (source) {
        case 'spotify':
            return <svg viewBox="0 0 24 24" fill="#1DB954" className="w-4 h-4 shrink-0 drop-shadow-[0_0_5px_rgba(29,185,84,0.5)]"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.66.3 1.02zm1.44-3.3c-.301.42-.84.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.32-1.38 9.72-.72 13.44 1.56.42.24.6.84.3 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.18-1.2-.18-1.38-.781-.18-.6.18-1.2.78-1.38 4.2-1.26 11.28-1.02 15.72 1.62.539.3.719 1.02.419 1.56-.239.54-.959.72-1.619.36z"/></svg>;
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
            return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0 text-gray-400 drop-shadow-[0_0_5px_rgba(156,163,175,0.5)]"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>;
    }
};

import About from './about/page';

interface FeedItem {
  id: number;
  username: string;
  cover_url?: string;
  source: string;
  title: string;
  artist: string;
  likes_count: number;
  comments_count: number;
  listening_with?: string[];
  is_playing?: boolean;
}

export default function Home() {
  const [globalHistory, setGlobalHistory] = useState<FeedItem[]>([]);
  const [friendsHistory, setFriendsHistory] = useState<FeedItem[]>([]);
  const [twins, setTwins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFeed, setActiveFeed] = useState('global');
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const user = localStorage.getItem('username');
    setUsername(user);

    const fetchFeeds = async () => {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      try {
        const globalRes = await fetch(`${API_URL}/api/global-history`);
        setGlobalHistory(await globalRes.json());

        if (user) {
            const friendsRes = await fetch(`${API_URL}/api/friends-history/${user}`);
            setFriendsHistory(await friendsRes.json());
            
            const twinsRes = await fetch(`${API_URL}/api/discovery/taste-twins?username=${user}`);
            setTwins(await twinsRes.json());
        }
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
    };

    fetchFeeds();
    const interval = setInterval(fetchFeeds, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleLike = async (e: React.MouseEvent, scrobbleId: number) => {
    e.stopPropagation();
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    try {
        await fetch(`${API_URL}/api/scrobble/${scrobbleId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey })
        });
        // Optimistic update or just wait for next fetch
    } catch (e) { console.error(e); }
  };

  const currentFeed = activeFeed === 'global' ? globalHistory : friendsHistory;

  if (!username && !loading) {
      return <About />;
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col items-center">
      
      <div className="w-full py-8 md:py-12 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-white/5 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white mb-1 flex items-center gap-2">
            Лента активности 🎧
          </h1>
          <p className="text-gray-400 text-sm">Смотри, что слушают прямо сейчас.</p>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <Link href={`/user/${username}`} className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] font-bold px-5 py-2.5 rounded-xl hover:scale-105 transition-all shadow-[0_0_15px_var(--accent-glow)] text-sm flex items-center justify-center">
            Мой Профиль
          </Link>
          <Link href="/leaderboard" className="bg-white/5 border border-white/10 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-white/10 transition-all text-sm flex items-center justify-center">
            Зал славы 🏆
          </Link>
        </div>
      </div>

      <div className="w-full mt-12 mb-20 px-4">
        
        <div className="flex items-center gap-6 mb-8 border-b border-white/5 pb-2">
            <button 
                onClick={() => setActiveFeed('global')} 
                className={`text-2xl font-black pb-2 border-b-2 transition-all ${activeFeed === 'global' ? 'border-[var(--accent)] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
                Глобальная лента
            </button>
            {username && (
                <button 
                    onClick={() => setActiveFeed('friends')} 
                    className={`text-2xl font-black pb-2 border-b-2 transition-all flex items-center gap-2 ${activeFeed === 'friends' ? 'border-[var(--accent)] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                    Лента друзей
                    {activeFeed === 'friends' && <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_10px_var(--accent-glow-strong)]"></span>}
                </button>
            )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-grow">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-50">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-[#1e1e1e] rounded-2xl animate-pulse"></div>)}
              </div>
            ) : activeFeed === 'friends' && friendsHistory.length === 0 ? (
              <div className="bg-[#1e1e1e]/50 backdrop-blur-md border border-white/5 p-10 rounded-2xl text-center text-gray-500 font-bold">
                Тут пусто. Подпишись на кого-нибудь, чтобы видеть их треки здесь!
              </div>
            ) : currentFeed.length === 0 ? (
              <div className="bg-[#1e1e1e]/50 backdrop-blur-md border border-white/5 p-10 rounded-2xl text-center text-gray-500 font-bold">
                Пока тихо... Врубай музыку!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnimatePresence mode="popLayout">
                    {currentFeed.map((item, idx) => (
                    <motion.div 
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={item.id || idx} 
                        className="bg-[#1a1a1a]/80 backdrop-blur-sm border border-white/5 p-4 rounded-2xl flex flex-col gap-4 hover:bg-[#1f1f1f] hover:border-[var(--accent)]/30 hover:-translate-y-1 hover:shadow-[0_10px_25px_-5px_var(--accent-glow-strong)] transition-all duration-300 group cursor-pointer relative overflow-hidden" 
                        onClick={() => window.location.href = `/user/${item.username}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-black rounded-xl overflow-hidden shrink-0 shadow-lg relative">
                                <img src={item.cover_url || "https://placehold.co/100x100/282828/ffcc00?text=🎵"} alt="Cover" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                {item.is_playing && (
                                    <div className="absolute inset-0 bg-[var(--accent)]/10 animate-pulse flex items-center justify-center">
                                        <div className="flex gap-0.5 items-end h-3">
                                            <div className="w-0.5 bg-[var(--accent)] animate-[music-bar_0.8s_ease-in-out_infinite]"></div>
                                            <div className="w-0.5 bg-[var(--accent)] animate-[music-bar_1.2s_ease-in-out_infinite]"></div>
                                            <div className="w-0.5 bg-[var(--accent)] animate-[music-bar_1.0s_ease-in-out_infinite]"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="truncate flex-grow">
                                <div className="font-bold text-white truncate group-hover:text-[var(--accent)] transition-colors flex items-center gap-1.5 mb-0.5">
                                    {getPlatformIcon(item.source)}
                                    {item.title}
                                </div>
                                <div className="text-xs text-gray-400 truncate mb-1">{item.artist}</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-black">
                                        @{item.username}
                                    </div>
                                    {item.listening_with && item.listening_with.length > 0 && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--accent-text)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full border border-[var(--accent)]/20 animate-pulse">
                                            <Users className="w-2.5 h-2.5" />
                                            Слушает с {item.listening_with[0]}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 pt-3 border-t border-white/5 mt-1">
                            <button 
                                onClick={(e) => toggleLike(e, item.id)}
                                className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors group/like"
                            >
                                <Heart className={`w-4 h-4 ${item.likes_count > 0 ? 'fill-red-500 text-red-500' : ''}`} />
                                {item.likes_count || 0}
                            </button>
                            <button className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-[var(--accent)] transition-colors">
                                <MessageCircle className="w-4 h-4" />
                                {item.comments_count || 0}
                            </button>
                        </div>
                    </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="w-full lg:w-80 shrink-0 space-y-6">
            {username && twins.length > 0 && (
                <div className="bg-[#121212]/80 backdrop-blur-md border border-white/5 rounded-2xl p-6 shadow-xl sticky top-24">
                    <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-[var(--accent)]" /> Taste Twins
                    </h3>
                    <div className="space-y-6">
                        {twins.map((twin) => (
                            <Link href={`/user/${twin.username}`} key={twin.username} className="block group">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/5 group-hover:border-[var(--accent)] transition-all">
                                        <img src={twin.avatar_url || `https://api.dicebear.com/9.x/micah/svg?seed=${twin.username}&backgroundColor=transparent`} className="w-full h-full object-cover" alt="Avatar" />
                                    </div>
                                    <div className="flex-grow">
                                        <div className="font-bold text-sm text-white group-hover:text-[var(--accent)] transition-colors">{twin.display_name}</div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">@{twin.username}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-[var(--accent)]">{twin.match}%</div>
                                        <div className="text-[8px] text-gray-600 font-bold uppercase">MATCH</div>
                                    </div>
                                </div>
                                <div className="text-[10px] text-gray-400 italic">
                                    Общие: {twin.common_artists.join(', ')}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
