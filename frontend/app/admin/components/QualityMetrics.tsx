"use client";
import { useEffect, useState } from "react";
import { qualityRequest } from "@/app/lib/qualityApi";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { tr } from "@/app/lib/i18n/active";
interface Quality {
  days: number;
  registered: number;
  activated: number;
  activation_percent: number | null;
  note: string;
  sources: {
    source: string;
    accounts: number;
    events: number;
    errors: number;
    average_processing_ms: number;
    verified_accounts: number;
  }[];
  api_latency: {
    route: string;
    requests: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    errors: number;
  }[];
}
export default function QualityMetrics() {
  const t = useT();
  const [data, setData] = useState<Quality | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    qualityRequest<Quality>("/api/admin/quality")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : tr("Метрики недоступны"),
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h3 className="text-base font-semibold">
        {t("Качество подключения и первое прослушивание")}
      </h3>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {data ? (
        <>
          <p className="text-sm text-fg-2">
            {t(
              "За {days} дней зарегистрировались: {registered}. Получено первое живое прослушивание: {activated} ({percent}%). Импорты не учитываются.",
              {
                days: data.days,
                registered: data.registered,
                activated: data.activated,
                percent: data.activation_percent ?? "—",
              },
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {[
                    msg("Источник"),
                    msg("Аккаунты / подтверждены"),
                    msg("События"),
                    msg("Ошибки"),
                    msg("Обработка, мс"),
                  ].map((label) => (
                    <th key={label} className="p-2">
                      {t(label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sources.map((source) => (
                  <tr key={source.source} className="border-t border-line">
                    <td className="p-2">{source.source}</td>
                    <td className="p-2">
                      {source.accounts} / {source.verified_accounts}
                    </td>
                    <td className="p-2">{source.events}</td>
                    <td className="p-2">{source.errors}</td>
                    <td className="p-2">{source.average_processing_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.api_latency.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">
                {t("Самые медленные API")}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      {[
                        msg("Маршрут"),
                        msg("Запросы"),
                        "p50",
                        "p95",
                        "p99",
                        "5xx",
                      ].map((label) => (
                        <th key={label} className="p-2">
                          {t(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.api_latency.map((row) => (
                      <tr key={row.route} className="border-t border-line">
                        <td className="p-2 font-mono">{row.route}</td>
                        <td className="p-2">{row.requests}</td>
                        <td className="p-2">
                          {t("{n} мс", { n: row.p50_ms })}
                        </td>
                        <td className="p-2">
                          {t("{n} мс", { n: row.p95_ms })}
                        </td>
                        <td className="p-2">
                          {t("{n} мс", { n: row.p99_ms })}
                        </td>
                        <td className="p-2">{row.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs text-fg-3">{t(data.note)}</p>
        </>
      ) : (
        !error && <p className="text-sm text-fg-3">{t("Загружаем метрики…")}</p>
      )}
    </section>
  );
}
