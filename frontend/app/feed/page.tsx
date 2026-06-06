"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GlobalFeed() {
    const [feed, setFeed] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchFeed = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/global-history`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setFeed(data || []);
            }
        } catch (e) { console.error(e); } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeed();
        const interval = setInterval(fetchFeed, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-white font-black text-2xl animate-pulse">📡 ПОДКЛЮЧЕНИЕ К ПОТОКУ...</div>;

    return (
        <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 max-w-4xl mx-auto">
            <h1 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter">Live Feed</h1>
            <p className="text-gray-500 mb-10 font-bold uppercase text-xs tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span> Прямой эфир со всего мира
            </p>

            <div className="space-y-4">
                {feed.map((s) => (
                    <button 
                        key={s.id} 
                        type="button" 
                        className="w-full bg-[#121212]/50 backdrop-blur-md p-4 rounded-xl border border-white/5 flex items-center gap-4 hover:border-[var(--accent)] transition-all group cursor-pointer text-left font-normal bg-transparent border-none outline-none block" 
                        onClick={() => router.push(`/user/${s.username}`)}
                    >
                        <div className="relative shrink-0">
                            {s.cover_url ? (
                                <img src={s.cover_url} className="w-14 h-14 rounded-lg object-cover shadow-lg group-hover:scale-105 transition-transform" alt="Cover" />
                            ) : (
                                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-lg text-yellow-500/80 shadow-lg group-hover:scale-105 transition-transform">🎵</div>
                            )}
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-[#121212] overflow-hidden bg-black">
                                <img src={s.avatar_url || `https://api.dicebear.com/9.x/micah/svg?seed=${s.username}&backgroundColor=transparent`} className="w-full h-full object-cover bg-[#282828]" onError={e => e.currentTarget.src = `https://api.dicebear.com/9.x/micah/svg?seed=${s.username}&backgroundColor=transparent`} alt={`${s.username}'s avatar`} />
                            </div>
                        </div>
                        <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-black text-white text-sm group-hover:text-[var(--accent-text)] transition-colors truncate">@{s.username}</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{s.relative_time}</span>
                            </div>
                            <p className="text-white font-bold truncate text-lg leading-tight">{s.title}</p>
                            <p className="text-gray-400 text-sm truncate">{s.artist}</p>
                        </div>
                        <div className="hidden md:block shrink-0">
                             {s.is_playing && (
                                 <div className="bg-emerald-500/10 px-3 py-1 rounded-full text-[10px] font-black text-emerald-500 uppercase tracking-widest animate-pulse border border-emerald-500/20">Listening Now</div>
                             )}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
