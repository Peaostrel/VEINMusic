import './globals.css';
import Navbar from './Navbar';
import Footer from './Footer';

/**
 * Root Layout
 * -----------
 * Глобальный каркас приложения.
 * Содержит: Navbar, Footer и общие стили.
 * Здесь же применен фикс для гидратации (suppressHydrationWarning).
 */
import type { Metadata } from "next";

export const metadata = {
  title: 'VEIN Music',
  description: 'Твой музыкальный профиль',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen flex flex-col relative bg-[#0a0a0a] text-white font-sans overflow-x-hidden">
        
        {/* Атмосферный фон (световые пятна) теперь тоже меняют цвет под тему! */}
        <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[var(--accent)] rounded-full mix-blend-screen filter blur-[150px] opacity-[0.06] animate-blob z-0 pointer-events-none transition-colors duration-1000"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-[var(--accent-hover)] rounded-full mix-blend-screen filter blur-[150px] opacity-[0.04] animate-blob animation-delay-2000 z-0 pointer-events-none transition-colors duration-1000"></div>

        <Navbar />

        <main className="flex-grow pt-32 pb-12 px-4 z-10 relative">
          {children}
        </main>
        
        <Footer />
      </body>
    </html>
  );
}