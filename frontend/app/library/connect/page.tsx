"use client";

import Link from "next/link";
import { useState } from "react";
import ConnectionCheck from "@/app/settings/components/ConnectionCheck";
import { btn, input, PageHeader } from "@/components/ui";
import { msg } from "@/app/lib/i18n/core";
import { useT } from "@/app/lib/i18n/client";

const SOURCES = [
  [
    "spotify",
    "Spotify",
    msg("Подключите аккаунт Spotify во вкладке интеграций."),
  ],
  [
    "yandex",
    msg("Яндекс Музыка"),
    msg(
      "Подключите Яндекс Музыку во вкладке интеграций. Можно слушать с телефона или компьютера.",
    ),
  ],
  [
    "soundcloud",
    "SoundCloud",
    msg("Подключите аккаунт SoundCloud, затем включите новый трек."),
  ],
  [
    "youtube",
    "YouTube Music",
    msg(
      "Установите расширение VEIN, подключите его по коду на странице устройств и разрешите доступ к YouTube Music.",
    ),
  ],
  [
    "extension",
    msg("Другой плеер"),
    msg(
      "Подключите расширение или приложение VEIN по коду. Включите нужный музыкальный источник в клиенте.",
    ),
  ],
];

export default function ConnectPage() {
  const t = useT();
  const [source, setSource] = useState("spotify");
  const [step, setStep] = useState(1);
  const chosen = SOURCES.find(([id]) => id === source)!;
  return (
    <main className="mx-auto max-w-[800px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        title={t("Первое подключение")}
        subtitle={t("От выбора сервиса до первого засчитанного трека")}
      />
      <Link href="/library" className="text-sm text-accent">
        {t("← Библиотека")}
      </Link>
      <ol
        className="grid grid-cols-3 gap-2 text-sm"
        aria-label={t("Шаги подключения")}
      >
        {[msg("Источник"), msg("Подключение"), msg("Проверка")].map(
          (name, index) => (
            <li
              key={name}
              aria-current={step === index + 1 ? "step" : undefined}
              className={`rounded-lg border p-3 ${step === index + 1 ? "border-accent" : "border-line"}`}
            >
              {index + 1}. {t(name)}
            </li>
          ),
        )}
      </ol>
      {step === 1 && (
        <section className="space-y-4">
          <h2 className="font-semibold">{t("Где вы слушаете музыку?")}</h2>
          <label>
            <span>{t("Музыкальный сервис")}</span>
            <select
              className={input}
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              {SOURCES.map(([id, name]) => (
                <option key={id} value={id}>
                  {t(name)}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`${btn.primary} ${btn.md}`}
            onClick={() => setStep(2)}
          >
            {t("Продолжить")}
          </button>
        </section>
      )}
      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-semibold">
            {t("Подключите {service}", { service: t(chosen[1]) })}
          </h2>
          <p className="text-sm text-fg-2">{t(chosen[2])}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/settings?tab=integrations"
              target="_blank"
              rel="noopener"
              className={`${btn.secondary} ${btn.md}`}
            >
              {t("Открыть интеграции ↗")}
            </Link>
            <Link
              href="/link"
              target="_blank"
              rel="noopener"
              className={`${btn.secondary} ${btn.md}`}
            >
              {t("Подключить по коду ↗")}
            </Link>
          </div>
          <p className="text-xs text-fg-3">
            {t(
              "Настройки откроются в новой вкладке. После подключения вернитесь сюда.",
            )}
          </p>
          <button
            className={`${btn.primary} ${btn.md}`}
            onClick={() => setStep(3)}
          >
            {t("Перейти к проверке")}
          </button>
        </section>
      )}
      {step === 3 && <ConnectionCheck key={source} defaultSource={source} />}
      {step > 1 && (
        <button
          className={`${btn.secondary} ${btn.md}`}
          onClick={() => setStep(step - 1)}
        >
          {t("Назад")}
        </button>
      )}
    </main>
  );
}
