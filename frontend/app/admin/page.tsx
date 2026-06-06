'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface User {
    id: number;
    username: string;
    display_name?: string;
    avatar_url?: string | null;
    bio?: string | null;
    is_verified?: boolean;
    level?: number;
    total_xp?: number;
    is_dev?: boolean;
    scrobbles?: number;
}

interface Achievement {
    id: number;
    name: string;
    description: string;
    icon: string;
    rule_type: string;
    rule_value: number;
    rule_target?: string;
    rule_meta?: string;
    target_image?: string;
    reward_xp: number;
}

interface Track {
    id: number;
    title: string;
    artist: string;
    cover_url?: string;
    track_url?: string;
}

interface Stats {
    users: User[];
    achievements: Achievement[];
    tracks: Track[];
    total_users?: number;
    total_scrobbles?: number;
    total_tracks?: number;
}

const EMOJI_LIST = [
  '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🔥', '⭐', '🌟', '✨', '👑', '💎', '🚀', '🛸', '⚡', '🎧', 
  '🎵', '🎶', '🎤', '💿', '🎸', '🎹', '🥁', '🦇', '👽', '👻', '💀', '🤡', '🤖', '👾', '🎃', '😈', 
  '👹', '👺', '🌍', '🌋', '🌌', '🌠', '🔮', '🧿', '🧬', '🦠', '🩸', '💊', '🗡️', '🛡️', '🔑', '🗝️', 
  '💣', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💯', '💢', '💥', '💫', 
  '💦', '💨', '🕳️', '👁️‍🗨️', '🧠', '🦴', '👀', '👅', '🎭', '🎨', '🎪', '🎰', '🎲', '🧩', '🧸', '♠️', 
  '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🌙', '🌞', '🌈'
];

// ─── Helper: get current ach field value ────────────────────────────────────
function getAchField<K extends keyof Achievement>(
    editingAch: Achievement | null,
    newAch: Omit<Achievement, 'id'>,
    field: K
): any {
    return editingAch ? editingAch[field] : (newAch as any)[field];
}

// ─── Helper: patch editingAch or newAch ──────────────────────────────────────
function patchAch(
    editingAch: Achievement | null,
    newAch: Omit<Achievement, 'id'>,
    setEditingAch: (a: Achievement | null) => void,
    setNewAch: (a: Omit<Achievement, 'id'>) => void,
    patch: Partial<Achievement>
) {
    if (editingAch) {
        setEditingAch({ ...editingAch, ...patch });
    } else {
        setNewAch({ ...newAch, ...patch });
    }
}

// ─── AchievementForm sub-component ───────────────────────────────────────────
interface AchFormProps {
    editingAch: Achievement | null;
    newAch: Omit<Achievement, 'id'>;
    setEditingAch: (a: Achievement | null) => void;
    setNewAch: (a: Omit<Achievement, 'id'>) => void;
    emojiPickerOpen: boolean;
    setEmojiPickerOpen: (v: boolean) => void;
    emojiRef: React.RefObject<HTMLDivElement | null>;
    onSave: () => void;
    onCreate: () => void;
}

function AchievementForm({ editingAch, newAch, setEditingAch, setNewAch, emojiPickerOpen, setEmojiPickerOpen, emojiRef, onSave, onCreate }: Readonly<AchFormProps>) {
    const patch = (p: Partial<Achievement>) => patchAch(editingAch, newAch, setEditingAch, setNewAch, p);
    const val = <K extends keyof Achievement>(field: K) => getAchField(editingAch, newAch, field);
    const ruleType = val('rule_type') as string;
    const isSpecific = ['specific_track', 'specific_album', 'specific_artist'].includes(ruleType);
    const isTrackOrAlbum = ['specific_track', 'specific_album'].includes(ruleType);

    return (
        <div className="space-y-5 relative z-10">
            <div>
                <label htmlFor="ach-name" className="text-xs text-red-500/70 font-mono mb-1.5 block">Название</label>
                <input id="ach-name" type="text" value={val('name') as string}
                    onChange={e => patch({ name: e.target.value })}
                    className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner" />
            </div>
            <div>
                <label htmlFor="ach-description" className="text-xs text-red-500/70 font-mono mb-1.5 block">Описание</label>
                <input id="ach-description" type="text" value={val('description') as string}
                    onChange={e => patch({ description: e.target.value })}
                    className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner" />
            </div>

            <div className="relative" ref={emojiRef}>
                <span className="text-xs text-red-500/70 font-mono mb-1.5 block">Иконка (эмодзи)</span>
                <button
                    id="ach-icon"
                    type="button"
                    className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white cursor-pointer hover:border-red-500 transition shadow-inner flex items-center justify-between text-left font-normal"
                    onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                >
                    <span className="text-xl leading-none">{val('icon') as string || 'Выбрать...'}</span>
                    <span className="text-xs text-gray-500">▼</span>
                </button>
                {emojiPickerOpen && (
                    <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-[#1a1010] border border-red-900/50 rounded-lg p-3 shadow-2xl z-50 grid grid-cols-8 gap-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                        {EMOJI_LIST.map((emoji) => (
                            <button key={emoji} onClick={() => { patch({ icon: emoji }); setEmojiPickerOpen(false); }} className="text-2xl hover:bg-white/10 rounded p-1 transition">{emoji}</button>
                        ))}
                    </div>
                )}
            </div>

            <div className="pt-5 border-t border-red-900/30">
                <label htmlFor="ach-rule-type" className="text-xs text-red-500/70 font-mono mb-1.5 block">Тип правила (Авто-выдача)</label>
                <select id="ach-rule-type" value={ruleType}
                    onChange={e => patch({ rule_type: e.target.value })}
                    className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner mb-5">
                    <option value="manual">Ручная выдача (админом)</option>
                    <option value="total_scrobbles">Всего скробблов &gt;= X</option>
                    <option value="night_scrobbles">Ночных скробблов &gt;= X</option>
                    <option value="specific_track">Определенный трек (X раз)</option>
                    <option value="specific_album">Определенный альбом (X треков с него)</option>
                    <option value="specific_artist">Определенный артист (X раз)</option>
                </select>

                {ruleType !== 'manual' && (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="ach-rule-value" className="text-xs text-red-500/70 font-mono mb-1.5 block">Значение (X)</label>
                            <input id="ach-rule-value" type="number" value={val('rule_value') as number}
                                onChange={e => patch({ rule_value: Number.parseInt(e.target.value) || 0 })}
                                className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner" placeholder="100" />
                        </div>
                        {isSpecific && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 w-full">
                                <div>
                                    <label htmlFor="ach-rule-target" className="text-xs text-red-500/70 font-mono mb-1.5 block">Ссылка (URL трека/альбома)</label>
                                    <input id="ach-rule-target" type="text" value={val('rule_target') as string}
                                        onChange={e => patch({ rule_target: e.target.value })}
                                        className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner" placeholder="https://music.yandex." />
                                </div>
                                <div>
                                    <label htmlFor="ach-rule-meta" className="text-xs text-red-500/70 font-mono mb-1.5 block">Слово в описании (для ссылки)</label>
                                    <input id="ach-rule-meta" type="text" value={val('rule_meta') as string}
                                        onChange={e => patch({ rule_meta: e.target.value })}
                                        className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner" placeholder="Например: Джизус" />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-4 mt-4">
                    {isTrackOrAlbum && (
                        <div>
                            <label htmlFor="ach-target-image" className="text-xs text-red-500/70 font-mono mb-1.5 block">URL картинки (сгенерируется само)</label>
                            <input id="ach-target-image" type="text" value={val('target_image') as string}
                                onChange={e => patch({ target_image: e.target.value })}
                                className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner" placeholder="Оставьте пустым" />
                        </div>
                    )}
                    <div>
                        <label htmlFor="ach-reward-xp" className="text-xs text-red-500/70 font-mono mb-1.5 block">Награда (XP)</label>
                        <input id="ach-reward-xp" type="number" value={val('reward_xp') as number}
                            onChange={e => patch({ reward_xp: Number.parseInt(e.target.value) || 0 })}
                            className="w-full bg-[#1a1010] border border-red-900/30 rounded-lg px-4 py-2.5 text-white outline-none focus:border-red-500 transition shadow-inner" placeholder="Например: 50" />
                    </div>
                </div>
            </div>

            <div className="flex gap-3 mt-6">
                {editingAch ? (
                    <>
                        <button onClick={onSave} className="flex-1 bg-gradient-to-r from-red-600 to-red-500 text-white font-black tracking-wide py-3 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:scale-[1.02] transition-transform">СОХРАНИТЬ</button>
                        <button onClick={() => setEditingAch(null)} className="flex-1 bg-white/5 border border-white/10 text-white font-bold py-3 rounded-lg hover:bg-white/10 transition">Отмена</button>
                    </>
                ) : (
                    <button onClick={onCreate} className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white font-black tracking-wide py-3 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:scale-[1.02] transition-transform">СОЗДАТЬ АЧИВКУ</button>
                )}
            </div>
        </div>
    );
}

export default function AdminPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('users'); 
  
  const emptyAch: Omit<Achievement, 'id'> = { name: '', description: '', icon: '', rule_type: 'manual', rule_value: 0, rule_target: '', rule_meta: '', target_image: '', reward_xp: 0 };
  const [newAch, setNewAch] = useState<Omit<Achievement, 'id'>>(emptyAch);
  const [editingAch, setEditingAch] = useState<Achievement | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  
  const router = useRouter();

  const loadData = () => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/stats`, { credentials: 'include',  cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Доступ запрещен');
        }
        return res.json();
      })
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
    const handleClickOutside = (event: MouseEvent) => {
        if (emojiRef.current && event.target instanceof Node && !emojiRef.current.contains(event.target)) setEmojiPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [router]);

  // --- УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ---
  const handleSaveUserEdit = async () => {
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/users/${editingUser!.username}`, { credentials: 'include', 
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  display_name: editingUser!.display_name,
                  bio: editingUser!.bio,
                  avatar_url: editingUser!.avatar_url
              })
          });
          if(res.ok) {
              setEditingUser(null);
              loadData();
          } else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const handleWipeScrobbles = async (username: string) => {
      if(!confirm(`ВНИМАНИЕ! Полностью стереть историю треков пользователя ${username}? Это нельзя отменить!`)) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/users/${username}/scrobbles`, { credentials: 'include',  method: 'DELETE' });
          if(res.ok) {
              alert("История очищена!");
              loadData();
          } else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const handleDeleteUser = async (username: string) => {
      if(!confirm(`Точно удалить пользователя ${username} навсегда?`)) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/users/${username}`, { credentials: 'include',  method: 'DELETE' });
          if(res.ok) { loadData(); }
          else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const handleEditLevel = async (username: string, currentLevel: number) => {
      const newLvl = prompt(`Новый уровень для ${username}:`, String(currentLevel));
      if(!newLvl || Number.isNaN(Number.parseInt(newLvl)) || Number.parseInt(newLvl) < 1) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/users/${username}/level`, { credentials: 'include', 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ new_level: Number.parseInt(newLvl) })
          });
          if(res.ok) { loadData(); }
          else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const handleToggleVerify = async (username: string, currentStatus: boolean) => {
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/users/${username}/verify`, { credentials: 'include', 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_verified: !currentStatus })
          });
          if (res.ok) { loadData(); }
          else {
              const err = await res.json();
              alert(err.detail || 'Ошибка при обновлении статуса');
          }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  // --- УПРАВЛЕНИЕ АЧИВКАМИ ---
  const handleGiveAch = async (username: string) => {
      const achs = stats?.achievements.map((a: Achievement) => `${a.id} - ${a.name}`).join('\n');
      const achId = prompt(`ID ачивки для ${username}:\n\n${achs}`);
      if(!achId || Number.isNaN(Number(achId))) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/users/${username}/achievements`, { credentials: 'include', 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ achievement_id: Number.parseInt(achId) })
          });
          if(res.ok) {
              alert("Ачивка выдана!");
              loadData();
          } else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const handleCreateAch = async () => {
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/achievements`, { credentials: 'include', 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...newAch, rule_value: Number.parseInt(String(newAch.rule_value)) || 0, reward_xp: Number.parseInt(String(newAch.reward_xp)) || 0 })
          });
          if(res.ok) {
              setNewAch(emptyAch);
              loadData();
          } else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const handleUpdateAch = async () => {
      if (!editingAch) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/achievements/${editingAch.id}`, { credentials: 'include', 
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...editingAch, rule_value: Number.parseInt(String(editingAch.rule_value)) || 0, reward_xp: Number.parseInt(String(editingAch.reward_xp)) || 0 })
          });
          if(res.ok) {
              setEditingAch(null);
              loadData();
          } else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const handleDeleteAch = async (id: number) => {
      if(!confirm("Удалить ачивку? Она пропадет у всех юзеров.")) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/achievements/${id}`, { credentials: 'include',  method: 'DELETE' });
          if(res.ok) { loadData(); }
          else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  const startEditAch = (a: Achievement) => {
      setEditingAch({
          id: a.id, name: a.name, description: a.description, icon: a.icon, 
          rule_type: a.rule_type, rule_value: a.rule_value, rule_target: a.rule_target || '', 
          rule_meta: a.rule_meta || '', target_image: a.target_image || '', reward_xp: a.reward_xp || 0
      });
      globalThis.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- УПРАВЛЕНИЕ ТРЕКАМИ ---
  const handleDeleteTrack = async (id: number) => {
      if(!confirm(`Точно удалить этот трек из глобальной БД? Все скробблы с ним будут УНИЧТОЖЕНЫ!`)) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/tracks/${id}`, { credentials: 'include',  method: 'DELETE' });
          if(res.ok) { loadData(); }
          else { alert(await res.text()); }
      } catch(e) { console.error(e); alert("Ошибка сети"); }
  };

  if (loading) return <div className="min-h-screen text-red-500 flex items-center justify-center font-bold text-xl">Подключение к ядру...</div>;
  if (error) return (
      <div className="min-h-screen text-red-500 flex flex-col items-center justify-center">
          <span className="text-6xl mb-4">⛔</span>
          <h1 className="text-3xl font-black mb-2">ACCESS DENIED</h1>
          <p className="text-gray-400">{error}</p>
      </div>
  );

  if (!stats) return null;
  return (
    <div className="max-w-6xl mx-auto p-6 text-white pb-20 pt-20">
      
      {/* Модалка редактирования юзера */}
      {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
              <div className="bg-[#120a0a] border-2 border-red-500/50 rounded-xl w-[450px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-red-500">ПРОФИЛЬ: {editingUser.username}</h3>
                  </div>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label htmlFor="edit-display-name" className="text-xs text-red-500/70 font-mono mb-1 block">Никнейм (Отображаемое имя)</label>
                          <input id="edit-display-name" type="text" value={editingUser.display_name} onChange={e=>setEditingUser({...editingUser, display_name: e.target.value})} className="w-full bg-[#1a1010] border border-red-900/30 rounded px-3 py-2 text-white outline-none focus:border-red-500" />
                      </div>
                      <div>
                          <label htmlFor="edit-avatar-url" className="text-xs text-red-500/70 font-mono mb-1 block">Аватар (URL)</label>
                          <input id="edit-avatar-url" type="text" value={editingUser.avatar_url || ''} onChange={e=>setEditingUser({...editingUser, avatar_url: e.target.value})} className="w-full bg-[#1a1010] border border-red-900/30 rounded px-3 py-2 text-white outline-none focus:border-red-500" />
                      </div>
                      <div>
                          <label htmlFor="edit-bio" className="text-xs text-red-500/70 font-mono mb-1 block">Описание (Bio)</label>
                          <textarea id="edit-bio" rows={3} value={editingUser.bio || ''} onChange={e=>setEditingUser({...editingUser, bio: e.target.value})} className="w-full bg-[#1a1010] border border-red-900/30 rounded px-3 py-2 text-white outline-none focus:border-red-500 resize-none"></textarea>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={handleSaveUserEdit} className="flex-1 bg-red-600 text-white font-black py-2 rounded shadow-[0_0_15px_rgba(239,68,68,0.4)] hover:bg-red-500 transition">СОХРАНИТЬ</button>
                      <button onClick={() => setEditingUser(null)} className="px-6 bg-white/10 text-white font-bold py-2 rounded hover:bg-white/20 transition">Отмена</button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex items-center gap-4 mb-8 border-b border-red-900/30 pb-4">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500 font-bold text-xl shadow-[0_0_15px_rgba(239,68,68,0.2)]">V</div>
          <div>
            <h1 className="text-2xl font-black text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]">VEIN CONTROL ROOM</h1>
            <p className="text-red-900/80 text-sm font-mono">Доступ уровня: Разработчик</p>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-[#1a1010] to-[#120a0a] border border-red-900/30 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="text-red-500/50 text-xs mb-2 font-mono uppercase tracking-widest relative z-10">Всего пользователей</div>
              <div className="text-4xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)] relative z-10">{stats.total_users}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1010] to-[#120a0a] border border-red-900/30 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="text-red-500/50 text-xs mb-2 font-mono uppercase tracking-widest relative z-10">Всего скробблов</div>
              <div className="text-4xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)] relative z-10">{stats.total_scrobbles}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1010] to-[#120a0a] border border-red-900/30 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="text-red-500/50 text-xs mb-2 font-mono uppercase tracking-widest relative z-10">База уникальных треков</div>
              <div className="text-4xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)] relative z-10">{stats.total_tracks}</div>
          </div>
      </div>

      {/* Навигация админки */}
      <div className="flex gap-2 mb-6 border-b border-red-900/30 pb-4">
          <button onClick={() => setActiveTab('users')} className={`px-5 py-2 font-bold rounded-lg transition-all ${activeTab === 'users' ? 'bg-red-500/20 text-red-500 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Пользователи</button>
          <button onClick={() => setActiveTab('achievements')} className={`px-5 py-2 font-bold rounded-lg transition-all ${activeTab === 'achievements' ? 'bg-red-500/20 text-red-500 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Достижения</button>
          <button onClick={() => setActiveTab('tracks')} className={`px-5 py-2 font-bold rounded-lg transition-all ${activeTab === 'tracks' ? 'bg-red-500/20 text-red-500 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>База треков</button>
      </div>

      {activeTab === 'users' && (
          <div className="bg-[#120a0a] border border-red-900/30 rounded-2xl overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-300">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-[#1a1010] border-b border-red-900/30">
                          <th className="p-4 font-mono text-xs text-red-500/70 uppercase tracking-widest">Юзер</th>
                          <th className="p-4 font-mono text-xs text-red-500/70 uppercase tracking-widest">Скробблы</th>
                          <th className="p-4 font-mono text-xs text-red-500/70 uppercase tracking-widest">Уровень</th>
                          <th className="p-4 font-mono text-xs text-red-500/70 uppercase tracking-widest">Управление</th>
                      </tr>
                  </thead>
                  <tbody className="max-h-[600px] overflow-y-auto custom-scrollbar">
                      {stats.users.map((u) => {
                          const level = Math.floor((u.total_xp ?? 0) / 100) + 1;
                          return (
                              <tr key={u.username} className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors">
                                  <td className="p-4">
                                      <div className="font-bold flex items-center gap-2">
                                          <img src={u.avatar_url || `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`} className="w-8 h-8 rounded bg-black border border-red-900/50" alt="Ava" />
                                          <div>
                                              <div className="flex items-center gap-1 text-white">
                                                  {u.username}
                                                  {u.is_dev && <span className="bg-red-500/20 text-red-500 px-1 py-0.5 rounded text-[8px] uppercase font-black border border-red-500/30">DEV</span>}
                                              </div>
                                              <div className="text-xs text-gray-500">{u.display_name}</div>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="p-4 font-mono text-sm text-gray-300">{u.scrobbles}</td>
                                  <td className="p-4 font-mono text-sm text-emerald-500 font-bold">{level}</td>
                                  <td className="p-4 flex flex-wrap gap-2">
                                      <button onClick={() => setEditingUser(u)} className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded text-xs font-bold hover:bg-blue-500/20 transition">Профиль</button>
                                      <button onClick={() => handleEditLevel(u.username, level)} className="px-3 py-1.5 bg-white/5 border border-white/10 text-gray-300 rounded text-xs font-bold hover:bg-white/10 transition">ЛВЛ</button>
                                      <button onClick={() => handleGiveAch(u.username)} className="px-3 py-1.5 bg-white/5 border border-white/10 text-gray-300 rounded text-xs font-bold hover:bg-white/10 transition">Ачивка</button>
                                      <button onClick={() => handleToggleVerify(u.username, !!u.is_verified)} className={`px-3 py-1.5 rounded text-xs font-bold transition border ${u.is_verified ? 'bg-red-900/10 border-red-900/30 text-red-500 hover:bg-red-900/30' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'}`}>
                                          {u.is_verified ? '- Галка' : '+ Галка'}
                                      </button>
                                      {!u.is_dev && (
                                          <>
                                              <button onClick={() => handleWipeScrobbles(u.username)} className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 text-orange-500 rounded text-xs font-bold hover:bg-orange-500/20 transition">Сбросить стату</button>
                                              <button onClick={() => handleDeleteUser(u.username)} className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-500 transition shadow-[0_0_10px_rgba(239,68,68,0.4)]">Удалить</button>
                                          </>
                                      )}
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      )}

      {activeTab === 'tracks' && (
          <div className="bg-[#120a0a] border border-red-900/30 rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg text-white">Последние добавленные треки</h3>
                  <p className="text-xs text-gray-500">Удаление трека здесь навсегда сотрет его из историй всех юзеров.</p>
              </div>
              <div className="space-y-2 max-h-[700px] overflow-y-auto custom-scrollbar pr-2">
                  {stats.tracks?.map(t => (
                      <div key={t.id} className="bg-[#1a1010] border border-red-900/10 hover:border-red-500/50 transition-colors p-3 rounded-xl flex items-center justify-between group">
                          <div className="flex items-center gap-4 truncate">
                              {t.cover_url ? (
                                  <img src={t.cover_url} className="w-12 h-12 rounded object-cover border border-white/5 shrink-0" alt="cover"/>
                              ) : (
                                  <div className="w-12 h-12 rounded bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-sm text-yellow-500/80 shrink-0 shadow-inner">🎵</div>
                              )}
                              <div className="truncate">
                                  <div className="font-bold text-white text-sm truncate">{t.title}</div>
                                  <div className="text-xs text-gray-400 truncate">{t.artist}</div>
                                  <div className="text-[9px] text-red-500/50 font-mono mt-0.5">ID: {t.id} | {t.track_url || 'No URL'}</div>
                              </div>
                          </div>
                          <button onClick={() => handleDeleteTrack(t.id)} className="px-4 py-2 bg-red-500/10 text-red-500 font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shrink-0 ml-4">
                              Уничтожить
                          </button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {activeTab === 'achievements' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start animate-in fade-in zoom-in-95 duration-300">
              
              <div className="bg-[#120a0a] border border-red-900/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <h3 className="font-bold mb-6 text-lg">{editingAch ? 'Редактировать ачивки' : 'Создать новую'}</h3>
                  
                  <AchievementForm
                      editingAch={editingAch}
                      newAch={newAch}
                      setEditingAch={setEditingAch}
                      setNewAch={setNewAch}
                      emojiPickerOpen={emojiPickerOpen}
                      setEmojiPickerOpen={setEmojiPickerOpen}
                      emojiRef={emojiRef}
                      onSave={handleUpdateAch}
                      onCreate={handleCreateAch}
                  />
              </div>

              <div className="bg-[#120a0a] border border-red-900/30 rounded-2xl p-6 shadow-xl h-full">
                  <h3 className="font-bold mb-6 text-lg">Существующие ачивки</h3>
                  <div className="space-y-4 max-h-[700px] overflow-y-auto custom-scrollbar pr-2">
                      {stats.achievements.length === 0 ? <div className="text-gray-500 text-sm">Пока нет ни одной ачивки.</div> : stats.achievements.map(a => (
                          <div key={a.id} className="bg-[#1a1010] border border-red-900/20 p-4 rounded-xl flex items-center justify-between group hover:border-red-500/50 transition-colors shadow-inner">
                              <div className="flex items-start gap-4 pr-4">
                                  {a.target_image ? (
                                      <img src={a.target_image} alt="Ach" className="w-10 h-10 rounded object-cover shadow-[0_0_10px_rgba(255,255,255,0.1)] shrink-0" />
                                  ) : (
                                      <span className="text-4xl leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] shrink-0">{a.icon}</span>
                                  )}
                                  <div>
                                      <div className="font-bold text-white text-sm flex items-center gap-2">
                                          {a.name} <span className="text-[10px] text-gray-600 bg-black/50 px-1.5 py-0.5 rounded border border-white/5">ID: {a.id}</span>
                                          {a.reward_xp > 0 && <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">+{a.reward_xp} XP</span>}
                                          {a.rule_type !== 'manual' && <span className="text-[10px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20" title="Автоматическая выдача">АВТО</span>}
                                      </div>
                                      <div className="text-[11px] text-gray-400 leading-tight mt-1.5">{a.description}</div>
                                  </div>
                              </div>
                              <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button onClick={()=>startEditAch(a)} className="text-gray-400 hover:text-white text-xs bg-white/5 hover:bg-white/10 p-2 rounded transition">✏️</button>
                                  <button onClick={()=>handleDeleteAch(a.id)} className="text-red-500/70 hover:text-red-50 text-xs bg-red-500/10 hover:bg-red-500/20 p-2 rounded transition">🗑️</button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
