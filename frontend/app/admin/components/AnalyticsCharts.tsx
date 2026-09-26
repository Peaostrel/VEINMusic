"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Timeseries } from "../types";
import { PanelTitle, panelClass, useAdminResource } from "../ui";

const tooltipStyle = {
  backgroundColor: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: "8px",
  color: "#fff",
  fontSize: 12,
};

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
}

function Chart({
  title,
  data,
  dataKey,
  color,
  kind,
}: Readonly<{
  title: string;
  data: Record<string, string | number>[];
  dataKey: string;
  color: string;
  kind: "line" | "bar";
}>) {
  const total = data.reduce((sum, row) => sum + Number(row[dataKey] || 0), 0);
  return (
    <figure className="bg-black/30 border border-white/5 rounded-xl p-3">
      <figcaption className="flex justify-between text-xs mb-2">
        <span className="font-bold text-white">{title}</span>
        <span className="font-mono text-gray-400">Σ {total}</span>
      </figcaption>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid stroke="#222" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="#777"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="#777"
                fontSize={10}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
              />
              <Bar
                dataKey={dataKey}
                name={title}
                fill={color}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid stroke="#222" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="#777"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="#777"
                fontSize={10}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey={dataKey}
                name={title}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Sign-ups, counted plays and active listeners per day. */
export default function AnalyticsCharts() {
  const [days, setDays] = useState(30);
  const { data, error } = useAdminResource<Timeseries>(
    `/api/admin/analytics/timeseries?days=${days}`,
  );
  const rows = (data?.days ?? []).map((day, i) => ({
    day: shortDate(day),
    registrations: data?.registrations[i] ?? 0,
    scrobbles: data?.scrobbles[i] ?? 0,
    active_users: data?.active_users[i] ?? 0,
  }));

  return (
    <section className={panelClass} aria-labelledby="analytics-heading">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle
          icon={
            <TrendingUp
              className="w-4 h-4 text-emerald-400"
              aria-hidden="true"
            />
          }
        >
          <span id="analytics-heading">Динамика (UTC)</span>
        </PanelTitle>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Период</legend>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${days === d ? "bg-red-600 text-white" : "bg-white/5 text-gray-300"}`}
            >
              {d} дн.
            </button>
          ))}
        </fieldset>
      </div>
      {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Chart
          title="Засчитанные прослушивания"
          data={rows}
          dataKey="scrobbles"
          color="#ef4444"
          kind="bar"
        />
        <Chart
          title="Активные слушатели"
          data={rows}
          dataKey="active_users"
          color="#10b981"
          kind="line"
        />
        <Chart
          title="Регистрации"
          data={rows}
          dataKey="registrations"
          color="#a855f7"
          kind="bar"
        />
      </div>
      <p className="text-[11px] text-gray-400">
        Регистрации считаются для аккаунтов, созданных после обновления с датой
        регистрации.
      </p>
    </section>
  );
}
