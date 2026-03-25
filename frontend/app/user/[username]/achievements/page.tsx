'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRankInfo } from '../../../Navbar';

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderDescriptionWithLinks(desc: string, meta: string | null, url: string | null, name: string) {
    let nodes: any[] = [desc];

    const fallbackMeta = (!meta || meta === 'None') ? name : meta;
    const realUrl = url && url.includes('||') ? url.split('||')[1] : url;
    const linkUrl = (realUrl && realUrl.startsWith('http')) ? realUrl : `https://music.yandex.ru/search?text=${encodeURIComponent(fallbackMeta)}`;

    // 1. Сначала обрабатываем rule_meta (Высший приоритет)
    const parts = fallbackMeta.split(/\s*[-—]\s*/);
    
    parts.forEach((targetWord, idx) => {
        if (!targetWord) return;
        const escapedWord = escapeRegExp(targetWord);
        const regex = new RegExp(`(${escapedWord})`, 'gi');
        
        let newNodes: any[] = [];
        nodes.forEach((node, nodeIdx) => {
            if (typeof node !== 'string') {
                newNodes.push(node);
                return;
            }
            const subParts = node.split(regex);
            if (subParts.length === 1) {
                newNodes.push(node);
                return;
            }
            subParts.forEach((sp, i) => {
                if (i % 2 === 1) {
                    newNodes.push(
                        <a key={`meta-${idx}-${nodeIdx}-${i}`} href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline font-bold">
                            {sp}
                        </a>
                    );
                } else if (sp) {
                    newNodes.push(sp);
                }
            });
        });
        nodes = newNodes;
    });

    // 2. Затем обрабатываем Markdown [Текст](Ссылка) на оставшихся текстовых нодах
    const mdRegex = /\[(.*?)\]\((.*?)\)/g;
    let finalNodes: any[] = [];

    nodes.forEach((node, nodeIdx) => {
        if (typeof node !== 'string') {
            finalNodes.push(node);
            return;
        }

        let lastIndex = 0;
        let match;
        while ((match = mdRegex.exec(node)) !== null) {
            if (match.index > lastIndex) {
                finalNodes.push(node.substring(lastIndex, match.index));
            }
            finalNodes.push(
                <a key={`md-${nodeIdx}-${match.index}`} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline font-bold">
                    {match[1]}
                </a>
            );
            lastIndex = mdRegex.lastIndex;
        }
        if (lastIndex < node.length) {
            finalNodes.push(node.substring(lastIndex));
        }
    });

    return finalNodes;
}

export default function AchievementsPage() {
    const username = useParams()?.username;
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!username) return;
        fetch(`http://127.0.0.1:8000/api/achievements/all/${username}`)
            .then(res => {
                if (!res.ok) throw new Error('Not found or Server Error');
                return res.json();
            })
            .then(d => {
                setData(d);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [username]);

    if (loading) return <div className="min-h-screen text-[var(--accent)] flex items-center justify-center font-bold text-2xl animate-pulse">Загрузка достижений...</div>;
    
    if (error || !data || !data.user) return (
        <div className="min-h-screen text-red-500 flex flex-col items-center justify-center font-bold text-2xl gap-4">
            <div>Ошибка загрузки или Пользователь не найден</div>
            <button onClick={() => router.push('/')} className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-black hover:bg-white/20 transition-colors">На главную</button>
        </div>
    );

    const progressPercent = data.total_count > 0 ? (data.earned_count / data.total_count) * 100 : 0;

    return (
        <div className="min-h-screen relative font-sans pt-8 pb-20">
            <div className="max-w-5xl mx-auto px-4">
                
                <div className="flex items-center gap-6 mb-10">
                    <button 
                        onClick={() => router.push(`/user/${username}`)} 
                        className="bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white transition-all shrink-0 p-3.5 rounded-xl shadow-lg backdrop-blur-sm group"
                    >
                        <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                        </svg>
                    </button>
                    <div className="flex items-center gap-5 bg-[#121212]/50 backdrop-blur-md border border-white/5 p-3 pr-8 rounded-2xl shadow-xl">
                        <img 
                            src={data.user.avatar_url || `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`} 
                            className="w-16 h-16 rounded-xl object-cover border-2 border-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)] bg-[#1a1a1a]" 
                            alt="Avatar"
                        />
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-wide">{data.user.display_name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[var(--accent)] text-xs font-bold uppercase tracking-widest">Достижения</span>
                                <span className="text-gray-600 text-xs font-mono">•</span>
                                <span className="text-gray-400 text-xs font-bold">@{data.user.username}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-[#121212]/80 backdrop-blur-md rounded-2xl p-6 mb-8 shadow-2xl border border-white/5">
                    <div className="flex justify-between items-end mb-4">
                        <div>
                            <div className="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-1">Прогресс</div>
                            <div className="text-lg font-black text-white">
                                Получено <span className="text-[var(--accent)] mx-1">{data.earned_count}</span> из {data.total_count}
                            </div>
                        </div>
                        <div className="text-3xl font-black text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent-glow)]">
                            {Math.round(progressPercent)}%
                        </div>
                    </div>
                    <div className="w-full bg-black/80 h-4 rounded-full overflow-hidden border border-white/10 p-0.5">
                        <div 
                            className="bg-[var(--accent)] h-full rounded-full shadow-[0_0_10px_var(--accent-glow)] relative transition-all duration-1000" 
                            style={{ width: `${progressPercent}%` }}
                        >
                            <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse rounded-full"></div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {data.achievements.map((a: any) => {
                        const currentVal = a.current_progress || 0;
                        const targetVal = a.target_value || 1;
                        const progressRatio = Math.min(currentVal / targetVal, 1);

                        return (
                            <div 
                                key={a.id} 
                                className={`relative overflow-hidden flex flex-col md:flex-row items-start md:items-center gap-5 p-5 rounded-2xl border transition-all duration-300 ${
                                    a.is_earned 
                                        ? 'bg-[#121212]/60 hover:bg-[#1a1a1a]/90 border-[var(--accent)]/30 hover:border-[var(--accent)]/50 shadow-[0_0_15px_var(--accent-glow)]' 
                                        : 'bg-black/40 border-transparent hover:border-white/5 opacity-75 grayscale hover:grayscale-0'
                                }`}
                            >
                                <div className={`w-20 h-20 shrink-0 rounded-xl flex items-center justify-center text-4xl shadow-inner border relative overflow-hidden ${a.is_earned ? 'bg-[#1a1a1a] border-[var(--accent)]/20' : 'bg-black border-white/5'}`}>
                                    {a.target_image ? (
                                        <img src={a.target_image} className="w-full h-full object-contain" alt="icon" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    ) : (
                                        <span className="drop-shadow-lg">{a.icon}</span>
                                    )}
                                    {!a.is_earned && <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"></div>}
                                </div>

                                <div className="flex-grow w-full md:w-auto">
                                    {/* Сделали мягкий белый для названия */}
                                    <h3 className={`text-xl font-black leading-tight mb-1 ${a.is_earned ? 'text-gray-200' : 'text-gray-500'}`}>
                                        {a.name}
                                    </h3>
                                    <div className="mb-3 max-w-2xl">
                                        <p className={`text-sm leading-relaxed ${a.is_earned ? 'text-gray-300' : 'text-gray-600'}`}>
                                            {renderDescriptionWithLinks(a.description, a.rule_meta, a.rule_target, a.name)}
                                        </p>
                                    </div>
                                    
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border ${
                                            a.rarity < 10 ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                            a.rarity < 30 ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                            'bg-white/5 text-gray-400 border-white/5'
                                        }`}>
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                                            </svg>
                                            Есть у {a.rarity}% пользователей
                                        </div>

                                        {!a.is_earned && a.rule_type !== 'manual' && targetVal > 0 && (
                                            <div className="flex-grow w-full max-w-[200px]">
                                                <div className="flex justify-between text-[10px] text-gray-500 font-bold mb-1 tracking-wider uppercase">
                                                    <span>Прогресс</span>
                                                    <span>{currentVal} / {targetVal}</span>
                                                </div>
                                                <div className="w-full bg-black/60 h-1.5 rounded-full overflow-hidden border border-white/5">
                                                    <div 
                                                        className="bg-gray-400 h-full rounded-full transition-all duration-500" 
                                                        style={{ width: `${progressRatio * 100}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="shrink-0 md:ml-auto md:text-right w-full md:w-auto mt-2 md:mt-0 flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                                    {a.is_earned ? (
                                        <>
                                            <div className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest mb-1.5">Разблокировано</div>
                                            {/* Сделали мягкий белый для даты */}
                                            <div className="text-sm font-black text-gray-200 bg-[var(--accent)]/20 px-3 py-1.5 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_10px_var(--accent-glow)]">
                                                {new Date(a.earned_at + 'Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-xs text-gray-600 font-black uppercase tracking-widest bg-black/50 px-4 py-2 rounded-lg border border-white/5 w-full md:w-auto text-center">
                                            Заблокировано
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}