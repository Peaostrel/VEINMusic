"use client";

import { useState } from "react";
import { Ban, RefreshCw, ShieldAlert } from "lucide-react";
import {
  Notice,
  PanelTitle,
  adminRequest,
  buttonClass,
  formatDateTime,
  inputClass,
  labelClass,
  panelClass,
  useAdminResource,
  useNotice,
} from "../ui";

interface SecurityEvents {
  labels: Record<string, string>;
  thresholds: Record<string, number>;
  series: ({ hour: number } & Record<string, number>)[];
  top_addresses: { ip: string; events: number }[];
}

interface IpBlock {
  id: number;
  network: string;
  reason: string;
  created_by: string;
  created_at: string | null;
  expires_at: string | null;
}

const DURATIONS = [
  { hours: 1, label: "1 час" },
  { hours: 24, label: "Сутки" },
  { hours: 24 * 7, label: "Неделя" },
  { hours: 24 * 30, label: "Месяц" },
  { hours: 24 * 365, label: "Год" },
];

function EventsPanel({
  data,
  onBlock,
}: Readonly<{
  data: SecurityEvents;
  onBlock: (ip: string) => void;
}>) {
  const lastHour = data.series.at(-1);
  return (
    <div className={panelClass}>
      <PanelTitle icon={<ShieldAlert aria-hidden="true" />}>
        Отказы за сутки
      </PanelTitle>
      <p className="text-xs text-fg-2">
        Если за час событий больше порога, администраторы получают уведомление.
        Один пользователь с опечатками в пароле даёт единицы, атака — сотни.
      </p>
      <table className="w-full text-left text-[13px]">
        <thead className="text-xs text-fg-3">
          <tr>
            <th className="py-1.5 font-medium">Событие</th>
            <th className="py-1.5 text-right font-medium">За час</th>
            <th className="py-1.5 text-right font-medium">За сутки</th>
            <th className="py-1.5 text-right font-medium">Порог в час</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.labels).map(([kind, label]) => {
            const hour = lastHour?.[kind] ?? 0;
            const day = data.series.reduce((sum, h) => sum + (h[kind] ?? 0), 0);
            const threshold = data.thresholds[kind];
            const alarming = threshold !== undefined && hour >= threshold;
            return (
              <tr key={kind} className="border-t border-line-soft">
                <td className="py-1.5 text-fg">{label}</td>
                <td
                  className={`py-1.5 text-right font-mono ${alarming ? "text-danger" : "text-fg"}`}
                >
                  {hour}
                </td>
                <td className="py-1.5 text-right font-mono text-fg-2">{day}</td>
                <td className="py-1.5 text-right font-mono text-fg-3">
                  {threshold ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4 className="pt-2 text-xs font-medium text-fg-2">
        Больше всего отказов в этот час
      </h4>
      {data.top_addresses.length === 0 ? (
        <p className="text-xs text-fg-3">Отказов не было.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {data.top_addresses.map((a) => (
            <li
              key={a.ip}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="font-mono text-[13px] text-fg">{a.ip}</span>
              <span className="ml-auto font-mono text-xs text-fg-2">
                {a.events}
              </span>
              <button
                type="button"
                className={buttonClass.danger}
                onClick={() => onBlock(a.ip)}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                На сутки
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Refusal statistics and temporary blocks of addresses. */
export default function SecurityTab() {
  const events = useAdminResource<SecurityEvents>("/api/admin/security/events");
  const blocks = useAdminResource<{ items: IpBlock[] }>(
    "/api/admin/security/ip-blocks",
  );
  const { notice, run } = useNotice();
  const [network, setNetwork] = useState("");
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState("");

  const block = async (value: string, forHours: number, why: string) => {
    if (
      await run(
        () =>
          adminRequest("/api/admin/security/ip-blocks", {
            method: "POST",
            json: { network: value, hours: forHours, reason: why },
          }),
        `${value} заблокирован`,
      )
    ) {
      setNetwork("");
      setReason("");
      blocks.reload();
    }
  };

  const unblock = async (item: IpBlock) => {
    if (
      await run(
        () =>
          adminRequest(`/api/admin/security/ip-blocks/${item.id}`, {
            method: "DELETE",
          }),
        `${item.network} разблокирован`,
      )
    )
      blocks.reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={() => {
            events.reload();
            blocks.reload();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Обновить
        </button>
      </div>

      {events.error && <Notice text={`❌ ${events.error}`} />}
      {events.data && (
        <EventsPanel
          data={events.data}
          onBlock={(ip) => block(ip, 24, "Много отказов за час")}
        />
      )}

      <div className={panelClass}>
        <PanelTitle icon={<Ban aria-hidden="true" />}>
          Блокировки адресов
        </PanelTitle>
        <p className="text-xs text-fg-2">
          Против идущей атаки, а не против человека: за одним адресом бывают
          сотни людей (мобильные операторы, офисы), а адреса меняются. Поэтому у
          блокировки всегда есть срок. Чтобы убрать конкретного человека,
          заблокируйте его аккаунт.
        </p>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (network.trim()) void block(network.trim(), hours, reason);
          }}
        >
          <div>
            <label htmlFor="block-network" className={labelClass}>
              Адрес или подсеть
            </label>
            <input
              id="block-network"
              className={inputClass}
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              placeholder="203.0.113.7 или 203.0.113.0/24"
            />
          </div>
          <div>
            <label htmlFor="block-hours" className={labelClass}>
              Срок
            </label>
            <select
              id="block-hours"
              className={inputClass}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              {DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="block-reason" className={labelClass}>
              Причина
            </label>
            <input
              id="block-reason"
              className={inputClass}
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Перебор паролей"
            />
          </div>
          <button type="submit" className={buttonClass.danger}>
            Заблокировать
          </button>
        </form>
        <Notice text={notice} />

        {blocks.data && blocks.data.items.length === 0 && (
          <p className="text-xs text-fg-3">Активных блокировок нет.</p>
        )}
        {blocks.data && blocks.data.items.length > 0 && (
          <ul className="divide-y divide-line-soft">
            {blocks.data.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5"
              >
                <span className="font-mono text-[13px] text-fg">
                  {item.network}
                </span>
                <span className="text-xs text-fg-2">
                  {item.reason || "без причины"}
                </span>
                <span className="ml-auto text-xs text-fg-3">
                  до {formatDateTime(item.expires_at)} · {item.created_by}
                </span>
                <button
                  type="button"
                  className={buttonClass.secondary}
                  onClick={() => unblock(item)}
                >
                  Снять
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
