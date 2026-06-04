import { THEMES } from '../utils';

export default function ThemeTab({ data, updateData, level }: any) {
  return (
    <div className="p-6 md:p-8">
        <h2 className="text-xl font-bold mb-6 text-[var(--accent-text)]">Выбор цветовой темы</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {THEMES.map(opt => {
                const isLocked = level < opt.req; 
                const isSelected = opt.isCustom ? data.theme.startsWith('#') : data.theme === opt.id;
                return (
                    <div key={opt.id} onClick={() => !isLocked && updateData('theme', opt.id)} className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${isLocked ? 'opacity-50 grayscale' : isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_15px_var(--accent-glow)]' : 'border-white/10 hover:border-white/30'}`}>
                        <div className="flex items-center gap-4"><div className="w-8 h-8 rounded-full shadow-lg" style={{background: opt.color}}></div><div><div className="font-bold text-white">{opt.name}</div><div className="text-xs text-gray-400">LVL {opt.req}</div></div></div>
                        {isLocked ? '🔒' : isSelected ? '✅' : null}
                    </div>
                );
            })}
        </div>
    </div>
  );
}
