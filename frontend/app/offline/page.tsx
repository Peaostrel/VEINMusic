import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Нет соединения",
  robots: { index: false, follow: false },
};

/**
 * Shown by the service worker for a page that was never opened before when
 * there is no connection. Plain links: it must work without JavaScript.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <p className="font-mono text-5xl font-semibold text-fg-3">offline</p>
      <h1 className="text-xl font-semibold text-fg">Нет соединения</h1>
      <p className="text-sm text-fg-2">
        Эта страница ещё не сохранена на устройстве. Лента, профили и
        статистика, которые вы уже открывали, доступны и без интернета.
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load, the router may be offline */}
        <a
          href="/"
          className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"
        >
          На главную
        </a>
      </div>
    </div>
  );
}
