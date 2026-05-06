'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEMES, LvlBadge, VerifiedBadge } from '../Navbar';

export default function Leaderboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/leaderboard`)
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="min-h-screen flex justify-center items-center font-bold text-2xl text-[var(--accent-text)] animate-pulse">Составляем списки лучших...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pt-24 min-h-screen">
      <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-white drop-shadow-[0_0_15px_var(--accent-glow)] mb-3">Зал Славы</h1>
          <p className="text-gray-400 font-medium">Самые активные слушатели VEIN Music</p>
      </div>

      <div className="bg-[#121212]/60 backdrop-blur-xl border border-white/5 rounded-3xl p-4 md:p-6 shadow-2xl">
        {users.length === 0 ? (
          <div className="text-center text-gray-500 py-10 font-bold">Никто еще не слушал музыку. Будь первым!</div>
        ) : (
          <ul className="space-y-3">
            {users.map((u, idx) => {
              const isTop3 = idx < 3;
              const rankCrown = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              const isHighLevel = u.level >= 50;
              const isRainbow = u.theme === 'rainbow';
              
              let glowColor = 'transparent';
              if (isHighLevel && !isRainbow) {
                  glowColor = u.theme?.startsWith('#') ? u.theme : ((THEMES as any)[u.theme]?.main || '#ffcc00');
              }

              return (
                <li key={u.username} 
                    className={`relative p-4 rounded-2xl flex items-center justify-between transition-all duration-300 group
                    ${isTop3 ? 'bg-white/10 border-white/20' : 'bg-white/5 border-transparent'} border
                    hover:scale-[1.02] hover:bg-white/10
                    ${isRainbow && isHighLevel ? 'theme-rainbow' : ''}`}
                    style={isHighLevel && !isRainbow ? { boxShadow: `0 0 15px ${glowColor}30`, borderColor: `${glowColor}50` } : {}}
                >
                  <div className="flex items-center gap-4 w-full min-w-0 pr-4">
                    <div className={`font-black w-8 text-center shrink-0 ${idx === 0 ? 'text-3xl drop-shadow-[0_0_10px_#ffcc00]' : idx === 1 ? 'text-2xl drop-shadow-[0_0_10px_#ccc]' : idx === 2 ? 'text-xl drop-shadow-[0_0_10px_#cd7f32]' : 'text-gray-500'}`}>
                        {rankCrown}
                    </div>
                    
                    <div className="relative shrink-0">
                        <img 
                            src={u.avatar_url || `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`} 
                            className={`rounded-full object-cover bg-black shadow-md border-2 transition-transform duration-300 group-hover:rotate-6
                            ${isTop3 ? 'w-14 h-14' : 'w-10 h-10'}
                            ${isHighLevel && !isRainbow ? '' : 'border-transparent'}`}
                            style={isHighLevel && !isRainbow ? { borderColor: glowColor } : {}}
                            onError={(e) => { e.currentTarget.src = `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`; }}
                            alt="avatar" 
                        />
                    </div>
                    
                    <div className="truncate">
                        <Link href={`/user/${u.username}`} className="font-black text-white text-lg hover:text-[var(--accent-text)] transition-colors truncate flex items-center">
                            {u.display_name || u.username}
                            <VerifiedBadge role={u.role} isVerified={u.is_verified} sizeClass="w-5 h-5" />
                            <LvlBadge level={u.level} />
                        </Link>
                        <div className="text-gray-400 text-xs font-medium mt-0.5 truncate">@{u.username}</div>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end">
                      <div className="bg-[#1a1a1a] text-[var(--accent-text)] font-black px-3 py-1.5 rounded-lg border border-white/5 shadow-inner">
                          {u.total_xp.toLocaleString('ru-RU')} XP
                      </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
