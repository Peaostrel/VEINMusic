"use client";

import { UserCheck } from "lucide-react";
import { PanelTitle, panelClass, useAdminResource } from "../ui";

interface Cohort {
  week: string;
  registered: number;
  connected: number;
  listened: number;
  week_1: number | null;
  week_1_of: number;
  week_4: number | null;
  week_4_of: number;
}

function share(part: number | null, whole: number) {
  if (part === null || !whole) return "—";
  return `${part} (${Math.round((part / whole) * 100)}%)`;
}

function weekLabel(iso: string) {
  const [, month, day] = iso.split("-");
  return `с ${day}.${month}`;
}

/** Weekly sign-up cohorts: connected music, listened, came back. */
export default function RetentionTable() {
  const { data, error } = useAdminResource<{ cohorts: Cohort[] }>(
    "/api/admin/analytics/retention",
  );
  const cohorts = (data?.cohorts ?? [])
    .filter((row) => row.registered)
    .reverse();
  return (
    <section className={panelClass} aria-labelledby="retention-heading">
      <PanelTitle
        icon={<UserCheck className="w-4 h-4 text-ok" aria-hidden="true" />}
      >
        <span id="retention-heading">Удержание по неделям регистрации</span>
      </PanelTitle>
      {error && <p className="text-danger text-xs font-medium">{error}</p>}
      {cohorts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-left text-fg-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Неделя</th>
                <th className="py-2 pr-3 font-medium">Регистраций</th>
                <th className="py-2 pr-3 font-medium">Подключили музыку</th>
                <th className="py-2 pr-3 font-medium">Слушали</th>
                <th className="py-2 pr-3 font-medium">
                  Вернулись на 2-й неделе
                </th>
                <th className="py-2 font-medium">На 5-й неделе</th>
              </tr>
            </thead>
            <tbody className="font-mono text-fg">
              {cohorts.map((row) => (
                <tr key={row.week} className="border-t border-line-soft">
                  <td className="py-2 pr-3">{weekLabel(row.week)}</td>
                  <td className="py-2 pr-3">{row.registered}</td>
                  <td className="py-2 pr-3">
                    {share(row.connected, row.registered)}
                  </td>
                  <td className="py-2 pr-3">
                    {share(row.listened, row.registered)}
                  </td>
                  <td className="py-2 pr-3">
                    {share(row.week_1, row.week_1_of)}
                  </td>
                  <td className="py-2">{share(row.week_4, row.week_4_of)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <p className="text-xs text-fg-2">
            За последние 12 недель регистраций не было.
          </p>
        )
      )}
      <p className="text-[11px] text-fg-2">
        «Подключили музыку»: есть прослушивание или привязан облачный сервис.
        Импорт истории не считается. Вернувшиеся считаются по прослушиваниям на
        8–14-й и 29–35-й день после регистрации; «—», пока срок не прошёл.
      </p>
    </section>
  );
}
