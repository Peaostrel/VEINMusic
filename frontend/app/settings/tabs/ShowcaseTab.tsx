export default function ShowcaseTab({ data, updateData }: any) {
  return (
    <div className="p-6 md:p-8 space-y-6">
        <h2 className="text-xl font-bold mb-4 text-[var(--accent-text)]">Витрина профиля</h2>
        <div className="bg-[#121212]/50 p-5 rounded-xl border border-white/5 space-y-6">
            <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">🎤 Любимый артист</label>
                <input value={data.favArtist} onChange={e=>updateData('favArtist', e.target.value)} className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none" placeholder="Имя артиста (например: Король и Шут)" />
            </div>
            
            <div className="pt-4 border-t border-white/5">
                <label className="block text-sm font-bold text-gray-300 mb-2">🎵 Любимый трек</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input value={data.favTrackArtist} onChange={e=>updateData('favTrackArtist', e.target.value)} className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none" placeholder="Имя артиста" />
                    <input value={data.favTrackName} onChange={e=>updateData('favTrackName', e.target.value)} className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none" placeholder="Название трека" />
                </div>
            </div>
            
            <div className="pt-4 border-t border-white/5">
                <label className="block text-sm font-bold text-gray-300 mb-2">💿 Любимый альбом</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input value={data.favAlbumArtist} onChange={e=>updateData('favAlbumArtist', e.target.value)} className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none" placeholder="Имя артиста" />
                    <input value={data.favAlbumName} onChange={e=>updateData('favAlbumName', e.target.value)} className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none" placeholder="Название альбома" />
                </div>
            </div>
        </div>
    </div>
  );
}
