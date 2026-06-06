import { THEMES } from '../utils';

export default function ThemeTab({ data, updateData, level }: any) {
  const isThemeCustom = data.theme && typeof data.theme === 'string' && data.theme.startsWith('#');
  
  return (
    <div className="p-6 md:p-8">
        <h2 className="text-xl font-bold mb-6 text-[var(--accent-text)]">Выбор цветовой темы</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {THEMES.map(opt => {
                const isLocked = level < opt.req; 
                const isSelected = opt.isCustom ? isThemeCustom : data.theme === opt.id;
                
                // Avoid nested ternaries
                let cardBorderClass = 'border-white/10 hover:border-white/30';
                if (isLocked) {
                    cardBorderClass = 'opacity-50 grayscale cursor-not-allowed';
                } else if (isSelected) {
                    cardBorderClass = 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_15px_var(--accent-glow)]';
                }

                let backgroundStyle = opt.color;
                if (opt.isRainbow) {
                    backgroundStyle = 'linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff)';
                } else if (opt.isCustom) {
                    backgroundStyle = isThemeCustom ? data.theme : 'linear-gradient(45deg, #ef4444, #3b82f6)';
                }

                return (
                    <button 
                        type="button"
                        key={opt.id} 
                        onClick={() => {
                            if (isLocked) return;
                            if (opt.isCustom) {
                                const currentColor = isThemeCustom ? data.theme : '#ef4444';
                                updateData('theme', currentColor);
                            } else {
                                updateData('theme', opt.id);
                            }
                        }} 
                        className={`text-left w-full p-4 rounded-xl border-2 transition-all flex flex-col gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 ${cardBorderClass}`}
                        disabled={isLocked}
                    >
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-4">
                                <div 
                                    className="w-8 h-8 rounded-full shadow-lg" 
                                    style={{
                                        background: backgroundStyle
                                    }}
                                ></div>
                                <div>
                                    <div className="font-bold text-white">{opt.name}</div>
                                    <div className="text-xs text-gray-400">LVL {opt.req}</div>
                                </div>
                            </div>
                        {(() => {
                            if (isLocked) return '🔒';
                            if (isSelected) return '✅';
                            return null;
                        })()}
                        </div>
                        
                        {isSelected && opt.isCustom && (
                            <div className="w-full pt-3 border-t border-white/5 flex items-center gap-3">
                                <span className="text-xs text-gray-400">Цвет:</span>
                                <input 
                                    type="color" 
                                    value={isThemeCustom ? data.theme : '#ef4444'} 
                                    onChange={e => updateData('theme', e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    className="w-10 h-7 rounded bg-transparent border border-white/10 cursor-pointer p-0"
                                />
                                <span className="font-mono text-xs text-white uppercase">{isThemeCustom ? data.theme : '#ef4444'}</span>
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    </div>
  );
}
