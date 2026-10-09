"use client";

import Link from "next/link";
import { useEffect } from "react";
import { btn } from "@/components/ui";

/** Shown instead of a page that crashed; the sidebar and header stay. */
export default function PageError({
  error,
  retry,
}: Readonly<{ error: Error & { digest?: string }; retry: () => void }>) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <p className="font-mono text-5xl font-semibold text-fg-3">:(</p>
      <h1 className="text-xl font-semibold text-fg">Что-то пошло не так</h1>
      <p className="text-sm text-fg-2">
        Страница не смогла загрузиться. Обычно помогает попробовать ещё раз.
      </p>
      {error.digest ? (
        <p className="text-xs text-fg-3">
          Если ошибка повторяется, напишите нам и приложите код:{" "}
          <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className={`${btn.primary} ${btn.md}`}
        >
          Попробовать ещё раз
        </button>
        <Link href="/" className={`${btn.secondary} ${btn.md}`}>
          На главную
        </Link>
      </div>
    </div>
  );
}
