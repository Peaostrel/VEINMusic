"use client";

import Link from "next/link";
import { useState } from "react";
import ConnectionCheck from "@/app/settings/components/ConnectionCheck";
import { btn, input, PageHeader } from "@/components/ui";

const SOURCES = [
  ["spotify", "Spotify", "Подключите аккаунт Spotify во вкладке интеграций."],
  [
    "yandex",
    "Яндекс Музыка",
    "Подключите Яндекс Музыку во вкладке интеграций. Можно слушать с телефона или компьютера.",
  ],
  [
    "soundcloud",
    "SoundCloud",
    "Подключите аккаунт SoundCloud, затем включите новый трек.",
  ],
  [
    "youtube",
    "YouTube Music",
    "Установите расширение VEIN, подключите его по коду на странице устройств и разрешите доступ к YouTube Music.",
  ],
  [
    "extension",
    "Другой плеер",
    "Подключите расширение или приложение VEIN по коду. Включите нужный музыкальный источник в клиенте.",
  ],
];

export default function ConnectPage() {
  const [source, setSource] = useState("spotify");
  const [step, setStep] = useState(1);
  const chosen = SOURCES.find(([id]) => id === source)!;
  return (
    <main className="mx-auto max-w-[800px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        title="Первое подключение"
        subtitle="От выбора сервиса до первого засчитанного трека"
      />
      <Link href="/library" className="text-sm text-accent">
        ← Библиотека
      </Link>
      <ol
        className="grid grid-cols-3 gap-2 text-sm"
        aria-label="Шаги подключения"
      >
        {["Источник", "Подключение", "Проверка"].map((name, index) => (
          <li
            key={name}
            aria-current={step === index + 1 ? "step" : undefined}
            className={`rounded-lg border p-3 ${step === index + 1 ? "border-accent" : "border-line"}`}
          >
            {index + 1}. {name}
          </li>
        ))}
      </ol>
      {step === 1 && (
        <section className="space-y-4">
          <h2 className="font-semibold">Где вы слушаете музыку?</h2>
          <label>
            <span>Музыкальный сервис</span>
            <select
              className={input}
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              {SOURCES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`${btn.primary} ${btn.md}`}
            onClick={() => setStep(2)}
          >
            Продолжить
          </button>
        </section>
      )}
      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-semibold">Подключите {chosen[1]}</h2>
          <p className="text-sm text-fg-2">{chosen[2]}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/settings?tab=integrations"
              target="_blank"
              rel="noopener"
              className={`${btn.secondary} ${btn.md}`}
            >
              Открыть интеграции ↗
            </Link>
            <Link
              href="/link"
              target="_blank"
              rel="noopener"
              className={`${btn.secondary} ${btn.md}`}
            >
              Подключить по коду ↗
            </Link>
          </div>
          <p className="text-xs text-fg-3">
            Настройки откроются в новой вкладке. После подключения вернитесь
            сюда.
          </p>
          <button
            className={`${btn.primary} ${btn.md}`}
            onClick={() => setStep(3)}
          >
            Перейти к проверке
          </button>
        </section>
      )}
      {step === 3 && <ConnectionCheck key={source} defaultSource={source} />}
      {step > 1 && (
        <button
          className={`${btn.secondary} ${btn.md}`}
          onClick={() => setStep(step - 1)}
        >
          Назад
        </button>
      )}
    </main>
  );
}
