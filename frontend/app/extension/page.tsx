import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleCheck,
  Headphones,
  Pause,
  ShieldCheck,
} from "lucide-react";
import { btn, card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Расширение для браузера",
  description:
    "Сохраняйте музыку из Яндекс Музыки, Spotify, YouTube Music, VK, SoundCloud и Apple Music в одной истории VEIN.",
  alternates: { canonical: "/extension" },
};

// Read at request time so deployments can override the published AMO listing.
export const dynamic = "force-dynamic";

function firefoxListing(): string | null {
  const value =
    process.env.FIREFOX_ADDON_URL?.trim() ||
    "https://addons.mozilla.org/en-US/firefox/addon/vein-music-tracker/";
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "addons.mozilla.org" &&
      /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?firefox\/addon\/[^/]+\/?$/.test(
        url.pathname,
      ) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Optional Chrome Web Store listing; the button stays hidden until it is set.
function chromeListing(): string | null {
  const value = process.env.CHROME_EXTENSION_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "chromewebstore.google.com" &&
      /^\/detail\/(?:[^/]+\/)?[a-p]{32}\/?$/.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash
      ? `${url.origin}${url.pathname}`
      : null;
  } catch {
    return null;
  }
}

const services = [
  "Яндекс Музыка",
  "Spotify",
  "YouTube Music",
  "VK Музыка",
  "SoundCloud",
  "Apple Music",
];
const steps = [
  [
    "Установите расширение",
    "Откройте карточку в магазине дополнений и подтвердите установку в браузере.",
  ],
  [
    "Подключите VEIN",
    "Откройте расширение, включите переключатель «Передавать прослушивания» и нажмите «Подключить через сайт». Войдите в VEIN и подтвердите код: пароль в расширение вводить не нужно.",
  ],
  [
    "Включите музыку",
    "Откройте любимый веб-плеер. Если вкладка была открыта до установки, перезагрузите её. В окне расширения сразу видно, принят ли трек.",
  ],
];

const statuses = [
  [
    "Трек принят",
    "Сервер получил событие. Прослушивание засчитывается по реально прослушанному времени, а не по одному запуску.",
  ],
  [
    "Нужно действие",
    "Интеграция выключена в настройках, включена приватная сессия или ключ устарел: расширение так и напишет.",
  ],
  [
    "Переживает короткий обрыв",
    "Если связь пропала на несколько секунд, расширение само повторит отправку текущего трека.",
  ],
];

const faq = [
  [
    "Трек играет, но в окне расширения пусто",
    "Перезагрузите вкладку плеера: расширение подключается к страницам, открытым после установки. Проверьте, что переключатель «Передавать прослушивания» включён и сервис есть в списке выше.",
  ],
  [
    "Прослушивание не появилось в профиле",
    "Короткие отрывки не засчитываются. Посмотрите статус последнего события в окне расширения: там указана причина, например выключенная интеграция или приватная сессия.",
  ],
  [
    "Как перенести расширение на другой компьютер",
    "Установите его и снова нажмите «Подключить через сайт». Каждое устройство подтверждается отдельно, а лишние можно отозвать в настройках VEIN, раздел «Безопасность».",
  ],
];

export default function ExtensionPage() {
  const firefoxUrl = firefoxListing();
  const chromeUrl = chromeListing();
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-16 px-4 py-12 md:px-8 md:py-20">
      <section className="grid items-center gap-10 md:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col items-start gap-5">
          <span className="font-mono text-xs text-accent">
            VEIN · расширение для браузера
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.03em] md:text-5xl">
            Ваша музыка.
            <br />
            Одна история.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-fg-2">
            Слушайте в привычных веб-плеерах. Расширение сохраняет прослушивания
            в VEIN, чтобы вы видели свои любимые треки, артистов и статистику
            вместе.
          </p>
          {firefoxUrl || chromeUrl ? (
            <div className="flex flex-wrap gap-3">
              {firefoxUrl && (
                <a
                  href={firefoxUrl}
                  className={`${btn.primary} ${btn.lg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Установить в Firefox{" "}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {chromeUrl && (
                <a
                  href={chromeUrl}
                  className={`${firefoxUrl ? btn.secondary : btn.primary} ${btn.lg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Установить в Chrome{" "}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface px-5 py-4">
              <p className="font-medium">Скоро в Firefox Add-ons</p>
              <p className="mt-1 text-sm text-fg-2">
                Готовим публикацию. Кнопка установки появится здесь, когда
                расширение станет доступно.
              </p>
            </div>
          )}
          <p className="text-xs text-fg-3">
            Бесплатно · {chromeUrl ? "Firefox 142+ и Chrome" : "Firefox 142+"}{" "}
            на компьютере · нужен аккаунт VEIN
          </p>
          <a
            href="#browsers"
            className="text-sm text-fg-2 underline underline-offset-4 hover:text-fg"
          >
            Другие браузеры
          </a>
        </div>
        <figure className="relative flex flex-col items-center gap-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 top-10 bottom-16 rounded-full bg-accent/15 blur-3xl"
          />
          <Image
            src="/extension/popup-connected.png"
            alt="Окно VEIN Music: передача прослушиваний включена, аккаунт подключён, последний трек принят сервером"
            width={640}
            height={996}
            sizes="(min-width: 768px) 320px, 80vw"
            className="relative h-auto w-full max-w-[320px] rounded-2xl border border-line shadow-2xl"
            priority
          />
          <figcaption className="text-xs text-fg-3">
            Всё управление — в окне расширения
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="services-title" className="flex flex-col gap-5">
        <h2 id="services-title" className="text-xl font-semibold">
          Слушайте там, где нравится
        </h2>
        <ul className="flex flex-wrap gap-2">
          {services.map((service) => (
            <li
              key={service}
              className="rounded-full border border-line px-4 py-2 text-sm text-fg-2"
            >
              {service}
            </li>
          ))}
        </ul>
        <p className="text-sm text-fg-3">
          Работает с веб-версиями сервисов. Для мобильных и настольных
          приложений используйте доступные интеграции VEIN.
        </p>
      </section>

      <section
        aria-labelledby="status-title"
        className={`${card} grid gap-8 p-6 md:grid-cols-[1fr_1.2fr] md:p-8`}
      >
        <div>
          <h2 id="status-title" className="text-2xl font-semibold">
            Видно, что трек дошёл
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-2">
            В окне расширения показан последний трек и ответ сервера. Не нужно
            гадать, записалось ли прослушивание: если что-то не так, расширение
            подскажет причину.
          </p>
        </div>
        <ul className="flex flex-col gap-4">
          {statuses.map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <CircleCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-2">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-title" className="flex flex-col gap-6">
        <h2 id="steps-title" className="text-2xl font-semibold">
          Три шага — и можно слушать
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map(([title, text], i) => (
            <li key={title} className={`${card} p-6`}>
              <span className="font-mono text-sm text-accent">0{i + 1}</span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">{text}</p>
            </li>
          ))}
        </ol>
        <Link
          href="/auth"
          className="text-sm text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Войти в VEIN или создать аккаунт
        </Link>
      </section>

      <section aria-labelledby="privacy-title" className={`${card} p-6 md:p-8`}>
        <h2 id="privacy-title" className="text-2xl font-semibold">
          Вы управляете передачей данных
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Headphones,
              title: "Только музыка",
              text: "Передаются сведения о треке, обложке и воспроизведении из поддерживаемых плееров. Расширение не читает общую историю браузера, сообщения или пароли музыкальных сервисов.",
            },
            {
              icon: ShieldCheck,
              title: "С вашего согласия",
              text: "Передача выключена по умолчанию. Чтобы начать, включите её в расширении и подключите свой аккаунт VEIN.",
            },
            {
              icon: Pause,
              title: "Пауза в любой момент",
              text: "Выключите переключатель, чтобы остановить передачу и очистить очередь. Кнопка «Отключить» также удаляет ключ аккаунта из расширения.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="mb-3 h-5 w-5 text-accent" aria-hidden="true" />
              <h3 className="font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">{text}</p>
            </div>
          ))}
        </div>
        <Link
          href="/privacy"
          className="mt-6 inline-block text-sm text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Политика конфиденциальности
        </Link>
      </section>

      <section
        id="browsers"
        aria-labelledby="browsers-title"
        className="flex scroll-mt-24 flex-col gap-5"
      >
        <h2 id="browsers-title" className="text-2xl font-semibold">
          Браузеры и установка
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={`${card} p-6`}>
            <h3 className="font-semibold">Firefox</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-2">
              {firefoxUrl
                ? "Установка через Firefox Add-ons с подтверждением браузера. Обновления приходят автоматически."
                : "Публикация в Firefox Add-ons готовится. Постоянная установка станет доступна после появления подписанной версии."}
            </p>
          </div>
          <div className={`${card} p-6`}>
            <h3 className="font-semibold">
              Chrome, Edge и другие Chromium-браузеры
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-2">
              {chromeUrl
                ? "Установка через Chrome Web Store, подходит и для Edge, Яндекс Браузера и других Chromium-браузеров. Обновления приходят автоматически."
                : "В магазинах пока недоступно. Для опытных пользователей есть ручная установка через режим разработчика, без автоматических обновлений."}
            </p>
            {chromeUrl && (
              <a
                href={chromeUrl}
                className="mt-4 mr-4 inline-block text-sm text-fg-2 underline underline-offset-4 hover:text-fg"
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть в Chrome Web Store
              </a>
            )}
            <a
              href="https://github.com/Peaostrel/VEINMusic/tree/VEIN/music-extension#chromium"
              className="mt-4 inline-block text-sm text-fg-2 underline underline-offset-4 hover:text-fg"
              target="_blank"
              rel="noopener noreferrer"
            >
              Инструкция по ручной установке
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="flex flex-col gap-5">
        <h2 id="faq-title" className="text-2xl font-semibold">
          Частые вопросы
        </h2>
        <div className="flex flex-col gap-3">
          {faq.map(([question, answer]) => (
            <details key={question} className={`${card} group px-6 py-4`}>
              <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-4">
                  {question}
                  <span
                    aria-hidden="true"
                    className="text-fg-3 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-fg-2">{answer}</p>
            </details>
          ))}
        </div>
        <p className="text-sm text-fg-3">
          Нужна помощь?{" "}
          <a
            href="https://github.com/Peaostrel/VEINMusic/issues"
            className="underline underline-offset-4 hover:text-fg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Сообщите о проблеме на GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
