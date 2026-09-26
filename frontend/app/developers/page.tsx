import Link from "next/link";
import { KeyRound } from "lucide-react";
import { btn } from "@/components/ui";
import CodeSamples from "./CodeSamples";

const TOC = [
  ["#auth", "Ключ"],
  ["#endpoints", "Эндпоинты"],
  ["#fields", "Поля скроббла"],
  ["#devices", "Подключение устройства"],
  ["#examples", "Примеры"],
];

const ENDPOINTS = [
  ["POST", "/api/scrobble", "Отправить трек в историю. Нужен api_key."],
  ["GET", "/api/user/:username", "Профиль, аватар и что играет сейчас."],
  ["GET", "/api/leaderboard", "Топ слушателей по опыту."],
  ["GET", "/api/public-stats", "Общие цифры сайта: прослушивания, треки."],
  ["POST", "/api/devices/code", "Начать подключение устройства без ключа."],
  ["POST", "/api/devices/token", "Забрать ключ, когда пользователь разрешил."],
];

const FIELDS: [string, boolean, string][] = [
  ["api_key", true, "Ваш секретный ключ."],
  ["title", true, "Название трека."],
  ["artist", true, "Исполнитель."],
  ["source", true, "Откуда трек: discord_rpc, custom_script и т. п."],
  ["album", false, "Альбом."],
  ["duration", false, "Длина трека в секундах."],
  ["progress_sec", false, "Сколько секунд уже прослушано."],
  ["is_playing", false, "Играет ли трек прямо сейчас."],
  ["cover_url, track_url", false, "Ссылки на обложку и сам трек."],
];

function Section({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: React.ReactNode }>) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-24 flex-col gap-4"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Code({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em] text-fg">
      {children}
    </code>
  );
}

export default function Developers() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] gap-14 px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <nav
        aria-label="Разделы документации"
        className="sticky top-24 hidden h-fit w-[180px] shrink-0 flex-col gap-1 lg:flex"
      >
        <span className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
          на странице
        </span>
        {TOC.map(([href, text]) => (
          <a
            key={href}
            href={href}
            className="rounded-md py-1.5 text-[13px] text-fg-2 transition-colors hover:text-fg"
          >
            {text}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 max-w-[760px] flex-1 flex-col gap-12">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-xs text-fg-3">
            разработчикам · API v1
          </span>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] md:text-[32px]">
            API для своих плееров и ботов
          </h1>
          <p className="max-w-[620px] text-[15px] leading-relaxed text-fg-2">
            Отправляйте прослушивания из любого плеера, Discord-бота или скрипта
            и забирайте статистику. Публичные GET-запросы работают без ключа.
          </p>
        </header>

        <Section id="auth" title="Ключ">
          <p className="text-sm leading-relaxed text-fg-2">
            Для POST-запросов нужен ваш <Code>api_key</Code>. Никому его не
            показывайте: с ним можно писать в вашу историю.
          </p>
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center">
            <span className="flex flex-1 items-start gap-3">
              <KeyRound
                className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                aria-hidden="true"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  Ключ показывается один раз — при регистрации
                </span>
                <span className="text-[13px] text-fg-2">
                  Потеряли? Выпустите новый, старый сразу перестанет работать.
                </span>
              </span>
            </span>
            <Link
              href="/settings?tab=integrations"
              className={`${btn.secondary} ${btn.md} shrink-0`}
            >
              Выпустить новый
            </Link>
          </div>
        </Section>

        <Section id="endpoints" title="Эндпоинты">
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="bg-surface text-xs text-fg-3">
                <tr>
                  <th className="w-[80px] px-4 py-2.5 font-normal">Метод</th>
                  <th className="px-4 py-2.5 font-normal">Путь</th>
                  <th className="px-4 py-2.5 font-normal">Что делает</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map(([method, path, desc]) => (
                  <tr key={path} className="border-t border-line-soft">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex h-[22px] items-center rounded px-2 font-mono text-[11px] font-medium ${
                          method === "POST"
                            ? "bg-accent text-on-accent"
                            : "bg-surface-2 text-fg-2"
                        }`}
                      >
                        {method}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap">
                      {path}
                    </td>
                    <td className="px-4 py-3 text-fg-2">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="fields" title="Поля скроббла">
          <dl className="rounded-xl border border-line">
            {FIELDS.map(([name, required, desc]) => (
              <div
                key={name}
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line-soft px-5 py-3 first:border-0 sm:grid-cols-[200px_110px_1fr]"
              >
                <dt className="font-mono text-[13px]">{name}</dt>
                <dd
                  className={`text-right text-xs sm:text-left ${required ? "text-accent" : "text-fg-3"}`}
                >
                  {required ? "обязательно" : "по желанию"}
                </dd>
                <dd className="col-span-2 text-[13px] text-fg-2 sm:col-span-1">
                  {desc}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="devices" title="Подключение устройства">
          <p className="text-sm leading-relaxed text-fg-2">
            Если не хотите, чтобы пользователь вставлял ключ руками, подключите
            устройство по короткому коду — так работает наше расширение.
          </p>
          <ol className="flex flex-col gap-3 text-sm text-fg-2">
            <li className="grid grid-cols-[28px_1fr]">
              <span className="font-mono text-accent">01</span>
              <span>
                Вызовите <Code>POST /api/devices/code</Code> с полем{" "}
                <Code>client_name</Code> и покажите пользователю{" "}
                <Code>user_code</Code>.
              </span>
            </li>
            <li className="grid grid-cols-[28px_1fr]">
              <span className="font-mono text-fg-3">02</span>
              <span>
                Пользователь вводит код на странице{" "}
                <Link href="/link" className="text-fg underline">
                  /link
                </Link>{" "}
                и разрешает доступ.
              </span>
            </li>
            <li className="grid grid-cols-[28px_1fr]">
              <span className="font-mono text-fg-3">03</span>
              <span>
                Опрашивайте <Code>POST /api/devices/token</Code> с{" "}
                <Code>device_code</Code> раз в <Code>interval</Code> секунд,
                пока статус <Code>pending</Code>. После подтверждения придёт{" "}
                <Code>api_key</Code>.
              </span>
            </li>
          </ol>
        </Section>

        <Section id="examples" title="Примеры">
          <CodeSamples />
        </Section>
      </div>
    </div>
  );
}
