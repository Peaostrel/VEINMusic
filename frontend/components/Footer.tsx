'use client';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/5 bg-[#121212]/80 backdrop-blur-md mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-2 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">
          <div className="w-6 h-6 bg-[var(--accent)] rounded flex items-center justify-center text-[#121212] font-black text-sm">V</div>
          <span className="font-bold text-sm text-white tracking-widest">VEIN<span className="text-[var(--accent)]">Music</span></span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-gray-500">
            <Link href="/developers" className="hover:text-[var(--accent)] transition-colors">API для разработчиков</Link>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <span className="cursor-not-allowed opacity-50">Правила</span>
        </div>

        <div className="text-xs text-gray-600 font-mono">
            © {new Date().getFullYear()} VEIN Engine
        </div>

      </div>
    </footer>
  );
}