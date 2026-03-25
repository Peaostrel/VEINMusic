'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEMES, LvlBadge } from '../Navbar';

const VerifiedBadge = ({ role, isVerified, sizeClass = "w-5 h-5" }) => {
  if (role === 'developer') return (
      <div className="inline-flex items-center justify-center ml-1.5" title="Разработчик VEIN">
          <svg viewBox="0 0 24 24" className={`${sizeClass} drop-shadow-[0_0_8px_rgba(255,204,0,0.6)] shrink-0`}><path fill="#1a1a1a" stroke="#ffcc00" strokeWidth="1.2" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.74 2.746 1.846 3.45-.05.22-.077.447-.077.68 0 2.21 1.71 3.998 3.918 3.998.47 0 .92-.084 1.336-.25C8.49 21.585 9.796 22.5 11.25 22.5c1.455 0 2.76-.915 3.338-2.25.416.166.866.25 1.336.25 2.21 0 3.918-1.79 3.918-4 0-.233-.026-.46-.077-.68 1.106-.704 1.846-1.99 1.846-3.45z"></path><path fill="#ffcc00" d="M10.25 16.5l-3.5-3.5 1.414-1.414 2.086 2.086 5.586-5.586 1.414 1.414-7 7z"></path></svg>
      </div>
  );
  if (role === 'tester' || isVerified) return (
      <div className="inline-flex items-center justify-center ml-1.5" title={role === 'tester' ? "Тестировщик" : "Верифицирован"}>
          <svg viewBox="0 0 24 24" className={`${sizeClass} drop-shadow-[0_0_8px_rgba(29,155,240,0.6)] shrink-0`}><path fill="#1D9BF0" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.74 2.746 1.846 3.45-.05.22-.077.447-.077.68 0 2.21 1.71 3.998 3.918 3.998.47 0 .92-.084 1.336-.25C8.49 21.585 9.796 22.5 11.25 22.5c1.455 0 2.76-.915 3.338-2.25.416.166.866.25 1.336.25 2.21 0 3.918-1.79 3.918-4 0-.233-.026-.46-.077-.68 1.106-.704 1.846-1.99 1.846-3.45z"></path><path fill="#ffffff" d="M10.25 16.5l-3.5-3.5 1.414-1.414 2.086 2.086 5.586-5.586 1.414 1.414-7 7z"></path></svg>
      </div>
  );
  return null;
};

export default function Leaderboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/leaderboard')
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
                  glowColor = u.theme?.startsWith('#') ? u.theme : (THEMES[u.theme]?.main || '#ffcc00');
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