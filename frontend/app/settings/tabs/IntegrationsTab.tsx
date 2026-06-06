export default function IntegrationsTab({ 
    data, updateData, userProfile, 
    handleDisconnect, saveYandexToken, 
    startLastfmImport, userApiKey, 
    generatedApiKey, handleGenerateApiKey,
    handleCopyKey, copied, API_URL
}: any) {
  return (
    <div className="p-6 md:p-8 space-y-6">
        <h2 className="text-2xl font-bold text-white">Интеграции</h2>
        
        {/* Spotify */}
        <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#1DB954]"></div>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <img src="https://www.svgrepo.com/show/475684/spotify-color.svg" className="w-12 h-12" alt="Spotify" />
                    <div><div className="flex items-center gap-2"><h3 className="font-bold text-lg text-white">Spotify Cloud</h3>{userProfile?.spotify_linked && <span className="bg-[#1DB954]/20 text-[#1DB954] text-[10px] px-2 py-0.5 rounded font-bold border border-[#1DB954]/30">ACTIVE</span>}</div><p className="text-sm text-gray-400">Скробблинг напрямую через сервер.</p></div>
                </div>
                <div className="flex gap-2">
                    {userProfile?.spotify_linked && <button type="button" onClick={() => handleDisconnect('spotify')} className="bg-red-900/20 text-red-400 border border-red-900/30 font-bold px-4 py-2 rounded-xl text-sm">Отключить</button>}
                    <button type="button" onClick={() => window.location.href = `${API_URL}/auth/spotify/login`} className="bg-[#1DB954] text-black font-black px-6 py-2 rounded-xl text-sm hover:scale-105 transition-all">🔗 {userProfile?.spotify_linked ? 'Обновить' : 'Привязать'}</button>
                </div>
            </div>
            {userProfile?.last_sync && userProfile?.spotify_linked && <div className="text-[10px] text-gray-500 uppercase flex items-center gap-2 mt-2"><span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse"></span>Последняя синхронизация: {new Date(userProfile.last_sync).toLocaleString()}</div>}
        </div>

        {/* Yandex */}
        <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
            <input type="text" style={{display: 'none'}} aria-hidden="true" />
            <input type="password" style={{display: 'none'}} aria-hidden="true" />
            
            <div className="absolute top-0 left-0 w-1 h-full bg-[#ffcc00]"></div>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#ffcc00] rounded-xl flex items-center justify-center text-black font-black text-xl">Y</div>
                    <div><div className="flex items-center gap-2"><h3 className="font-bold text-lg text-white">Yandex Cloud</h3>{userProfile?.yandex_linked && <span className="bg-[#ffcc00]/20 text-[#ffcc00] text-[10px] px-2 py-0.5 rounded font-bold border border-[#ffcc00]/30">ACTIVE</span>}</div><p className="text-sm text-gray-400">Требуется OAuth токен. <a href="https://oauth.yandex.ru/authorize?response_type=token&client_id=23c698c6b1ed4aef973d0348b9ff57f0" target="_blank" rel="noreferrer" className="text-[#ffcc00] hover:underline font-bold ml-1">Получить токен</a></p></div>
                </div>
                <div className="flex flex-col gap-2 w-64">
                    <input 
                    type="password" 
                    value={data.yandexToken} 
                    onChange={e=>updateData('yandexToken', e.target.value)} 
                    placeholder="y0_AgAAA..." 
                    autoComplete="new-password"
                    readOnly
                    onFocus={(e) => e.target.removeAttribute('readonly')}
                    className="bg-black/50 border border-white/10 p-2.5 rounded-lg text-sm text-white outline-none focus:border-[#ffcc00]" 
                    />
                    <div className="flex gap-2">
                        {userProfile?.yandex_linked && <button type="button" onClick={() => handleDisconnect('yandex')} className="flex-1 bg-red-900/20 text-red-400 border border-red-900/30 font-bold py-2 rounded-lg text-xs">Удалить</button>}
                        <button type="button" onClick={saveYandexToken} className="flex-1 bg-[#ffcc00] text-black font-bold py-2 rounded-lg text-xs">Сохранить</button>
                    </div>
                </div>
            </div>
            {userProfile?.last_sync && userProfile?.yandex_linked && <div className="text-[10px] text-gray-500 uppercase flex items-center gap-2 mt-2"><span className="w-1.5 h-1.5 rounded-full bg-[#ffcc00] animate-pulse"></span>Последняя синхронизация: {new Date(userProfile.last_sync).toLocaleString()}</div>}
        </div>

        {/* Last.fm */}
        <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#D51007]"></div>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <svg viewBox="0 0 24 24" fill="#D51007" className="w-12 h-12 shrink-0 drop-shadow-[0_0_8px_rgba(213,16,7,0.4)]" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z"/>
                    </svg>
                    <div><h3 className="font-bold text-lg text-white">Last.fm Import</h3><p className="text-sm text-gray-400">Импорт истории прослушиваний.</p></div>
                </div>
                <div className="flex flex-col gap-2 w-64">
                    <input 
                    value={data.lastfmUsername} 
                    onChange={e=>updateData('lastfmUsername', e.target.value)} 
                    placeholder="Username" 
                    autoComplete="off"
                    readOnly
                    onFocus={(e) => e.target.removeAttribute('readonly')}
                    className="bg-black/50 border border-white/10 p-2.5 rounded-lg text-sm text-white outline-none focus:border-[#D51007]" 
                    />
                    <div className="flex gap-2">
                        {data.lastfmUsername && <button type="button" onClick={() => handleDisconnect('lastfm')} className="flex-1 bg-red-900/20 text-red-400 border border-red-900/30 font-bold py-2 rounded-lg text-xs">Очистить</button>}
                        <button type="button" onClick={startLastfmImport} className="flex-1 bg-[#D51007] text-white font-bold py-2 rounded-lg text-xs">Импорт</button>
                    </div>
                </div>
            </div>
        </div>

        {/* Extension */}
        {userProfile?.has_api_key && (
            <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
                <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent)]"></div>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-xl flex items-center justify-center font-black text-2xl shadow-lg shrink-0" style={{color: 'var(--text-on-accent)'}}>V</div>
                        <div>
                            <h3 className="font-bold text-lg text-white">Расширение VEIN</h3>
                            <p className="text-sm text-gray-400">Ключ для браузерного скробблера.</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-white/5">
                            <code className="text-[var(--accent-text)] px-3 font-mono text-sm">
                                {generatedApiKey ?? "••••••••••••••••••••••••••••••••"}
                            </code>
                            {generatedApiKey && (
                                <button type="button" onClick={handleCopyKey} className="bg-white/5 border border-white/10 text-white hover:text-[var(--accent-text)] px-3 py-1.5 rounded font-bold text-xs">
                                    {copied ? 'OK!' : 'Copy'}
                                </button>
                            )}
                        </div>
                        <button type="button" onClick={handleGenerateApiKey} className="bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-4 py-2.5 rounded-lg font-bold text-xs transition-all text-center">
                            {generatedApiKey ? 'Сгенерировать другой' : 'Сбросить и сгенерировать API ключ'}
                        </button>
                    </div>
                </div>
                {generatedApiKey && (
                    <div className="text-xs text-yellow-500 font-semibold border-t border-yellow-500/10 pt-2 mt-1">
                        ⚠️ Внимание: этот ключ показывается только один раз! Обязательно скопируйте его прямо сейчас. При перезагрузке страницы он скроется.
                    </div>
                )}
            </div>
        )}
    </div>
  );
}
