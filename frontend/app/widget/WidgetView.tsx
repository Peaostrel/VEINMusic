"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL, apiJson } from "@/app/lib/api";
import { useT } from "@/app/lib/i18n/client";
import { btn, card, PageHeader, textarea } from "@/components/ui";
import { widgetScript } from "./script";

const SCRIPTABLE_URL = "https://apps.apple.com/app/scriptable/id1405459188";
// Listed and revocable with the other devices in Settings → Security
const KEY_NAME = "Устройство: iPhone-виджет";

export default function WidgetView() {
  const t = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("username")));
  }, []);

  const createKey = async () => {
    setBusy(true);
    setMessage("");
    try {
      const key = await apiJson<{ api_key: string }>("/api/developer/keys", {
        method: "POST",
        json: { name: KEY_NAME, scopes: "profile:read" },
      });
      setScript(
        widgetScript(API_URL, window.location.origin, key.api_key, t.lang),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Ошибка"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setMessage(t("Скрипт скопирован."));
    } catch {
      setMessage(
        t("Не получилось скопировать: выделите текст и скопируйте вручную."),
      );
    }
  };

  const steps = [
    t("Установите бесплатное приложение Scriptable из App Store."),
    t("Создайте ключ ниже и скопируйте готовый скрипт."),
    t("В Scriptable нажмите «+», вставьте скрипт и назовите его VEIN Music."),
    t(
      "Удерживайте палец на домашнем экране, нажмите «+», выберите Scriptable и нужный размер виджета.",
    ),
    t(
      "Нажмите на виджет в режиме редактирования и выберите скрипт VEIN Music. Так же он добавляется на экран блокировки.",
    ),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader
        title={t("Виджет для iPhone")}
        subtitle={t(
          "Последний трек и прослушивания за неделю на домашнем экране и экране блокировки, без отдельного приложения.",
        )}
      />

      <section className={`${card} flex flex-col gap-3 p-5`}>
        <h2 className="text-base font-semibold text-fg">
          {t("Как поставить")}
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-2">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <a
          href={SCRIPTABLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn.secondary} ${btn.md} self-start`}
        >
          {t("Scriptable в App Store ↗")}
        </a>
      </section>

      <section className={`${card} flex flex-col gap-3 p-5`}>
        <h2 className="text-base font-semibold text-fg">{t("Скрипт")}</h2>
        {signedIn === false ? (
          <p className="text-sm text-fg-2">
            <Link href="/auth" className="text-fg underline">
              {t("Войдите")}
            </Link>
            {", "}
            {t("чтобы создать ключ для виджета.")}
          </p>
        ) : (
          <>
            <p className="text-sm text-fg-2">
              {t(
                "Ключ только читает вашу статистику: им нельзя отправлять прослушивания или менять аккаунт. Отозвать его можно в настройках, в разделе «Безопасность».",
              )}
            </p>
            {script ? (
              <>
                <textarea
                  autoComplete="off"
                  readOnly
                  value={script}
                  rows={10}
                  aria-label={t("Скрипт для Scriptable")}
                  className={`${textarea} font-mono text-xs`}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={() => {
                    void copy();
                  }}
                  className={`${btn.primary} ${btn.md} self-start`}
                >
                  {t("Скопировать скрипт")}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || signedIn === null}
                onClick={() => {
                  void createKey();
                }}
                className={`${btn.primary} ${btn.md} self-start`}
              >
                {busy ? t("Создаём ключ…") : t("Создать ключ и скрипт")}
              </button>
            )}
          </>
        )}
        {message && (
          <p role="status" className="text-sm text-fg-2">
            {message}
          </p>
        )}
      </section>

      <section className={`${card} flex flex-col gap-3 p-5`}>
        <h2 className="text-base font-semibold text-fg">
          {t("Команда для Siri")}
        </h2>
        <p className="text-sm text-fg-2">
          {t(
            "В приложении «Команды» создайте команду с действием Scriptable «Run Script», выберите скрипт VEIN Music и добавьте «Показать результат» или «Произнести текст». Назовите команду, например, «Что я слушаю», и вызывайте её через Siri.",
          )}
        </p>
      </section>
    </div>
  );
}
