"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL } from "@/app/lib/api";
import { Avatar, EmptyState, Loading, Meter, btn } from "@/components/ui";
import type { AchievementInfo } from "@/app/lib/types";

/** GET /api/achievements/all/{username} */
interface AchievementsResponse {
  user: { username: string; display_name: string; avatar_url: string | null };
  achievements: AchievementInfo[];
  earned_count: number;
  total_count: number;
}

type DescriptionNode = string | React.ReactElement;

function parseMarkdownForNode(
  node: DescriptionNode,
  nodeIdx: number,
): DescriptionNode[] {
  if (typeof node !== "string") {
    return [node];
  }
  const finalNodes: DescriptionNode[] = [];
  let lastIndex = 0;
  while (lastIndex < node.length) {
    const link = findNextLink(node, lastIndex);
    if (!link) {
      finalNodes.push(node.substring(lastIndex));
      break;
    }

    if (link.startBracket > lastIndex) {
      finalNodes.push(node.substring(lastIndex, link.startBracket));
    }

    finalNodes.push(
      <a
        key={`md-${nodeIdx}-${link.startBracket}`}
        href={link.linkUrl}
        target="_blank"
        rel="noopener noreferrer"

        className="text-accent hover:underline"
      >
        {link.linkText}
      </a>,
    );

    lastIndex = link.endParenthesis + 1;
  }

  return finalNodes;
}

interface ParsedLink {
  startBracket: number;
  endBracket: number;
  endParenthesis: number;
  linkText: string;
  linkUrl: string;
}

function findNextLink(node: string, lastIndex: number): ParsedLink | null {
  let searchStart = lastIndex;
  while (true) {
    const startBracket = node.indexOf("[", searchStart);
    if (startBracket === -1) {
      return null;
    }

    const endBracket = node.indexOf("]", startBracket);
    if (endBracket === -1) {
      return null;
    }

    if (endBracket + 1 < node.length && node[endBracket + 1] === "(") {
      const endParenthesis = node.indexOf(")", endBracket + 2);
      if (endParenthesis !== -1) {
        return {
          startBracket,
          endBracket,
          endParenthesis,
          linkText: node.substring(startBracket + 1, endBracket),
          linkUrl: node.substring(endBracket + 2, endParenthesis),
        };
      }
    }

    searchStart = startBracket + 1;
  }
}

function renderDescriptionWithLinks(
  desc: string,
  meta: string | null,
  url: string | null,
  name: string,
) {
  // 1. Markdown links [text](url) first: highlighting a name from the goal
  // inside one ("[Проводник](…)") would break its syntax
  let nodes: DescriptionNode[] = parseMarkdownForNode(desc, 0);

  const fallbackMeta = !meta || meta === "None" ? name : meta;
  const rawUrl = url?.includes("||") ? url.split("||")[1] : url;
  const linkUrl = rawUrl?.startsWith("http")
    ? rawUrl
    : `https://music.yandex.ru/search?text=${encodeURIComponent(fallbackMeta)}`;

  // 2. Then the names from the goal, in the remaining plain text
  const parts = fallbackMeta.split(/[-—]/).map((s) => s.trim());

  parts.forEach((targetWord, idx) => {
    if (!targetWord) return;
    const lowerTarget = targetWord.toLowerCase();

    const newNodes: DescriptionNode[] = [];
    nodes.forEach((node, nodeIdx) => {
      if (typeof node !== "string") {
        newNodes.push(node);
        return;
      }
      const lowerNode = node.toLowerCase();
      let lastIdx = 0;
      let idxOf = lowerNode.indexOf(lowerTarget, lastIdx);
      if (idxOf === -1) {
        newNodes.push(node);
        return;
      }
      while (idxOf !== -1) {
        if (idxOf > lastIdx) {
          newNodes.push(node.substring(lastIdx, idxOf));
        }
        const matchedWord = node.substring(idxOf, idxOf + targetWord.length);
        newNodes.push(
          <a
            key={`meta-${idx}-${nodeIdx}-${idxOf}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"

            className="text-accent hover:underline"
          >
            {matchedWord}
          </a>,
        );
        lastIdx = idxOf + targetWord.length;
        idxOf = lowerNode.indexOf(lowerTarget, lastIdx);
      }
      if (lastIdx < node.length) {
        newNodes.push(node.substring(lastIdx));
      }
    });
    nodes = newNodes;
  });

  return nodes;
}

export default function AchievementsPage() {
  const username = useParams()?.username;
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!username) return;
    fetch(`${API_URL}/api/achievements/all/${username}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Not found or Server Error");
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [username]);

  if (loading) return <Loading label="Загружаем достижения…" />;

  if (error || !data?.user)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Не удалось загрузить</h1>
        <p className="text-sm text-fg-2">
          Пользователь не найден или сервер не ответил.
        </p>
        <Link href="/" className={`${btn.secondary} ${btn.md} mt-4`}>
          На главную
        </Link>
      </div>
    );

  const progressPercent =
    data.total_count > 0 ? (data.earned_count / data.total_count) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <header className="flex flex-col gap-3">
        <Link
          href={`/user/${username}`}
          className="self-start text-[13px] text-fg-2 hover:text-fg"
        >
          ← Профиль
        </Link>
        <div className="flex items-center gap-4">
          <Avatar
            src={data.user.avatar_url}
            seed={String(username)}
            size={48}
          />
          <div className="flex flex-col">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
              {data.user.display_name}
            </h1>
            <span className="text-sm text-fg-2">
              Достижения ·{" "}
              <span className="font-mono text-fg-3">@{data.user.username}</span>
            </span>
          </div>
        </div>
      </header>

      <section
        aria-label="Прогресс"
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm text-fg-2">
            Получено{" "}
            <span className="font-mono text-fg">{data.earned_count}</span> из{" "}
            <span className="font-mono text-fg">{data.total_count}</span>
          </p>
          <span className="font-mono text-2xl font-medium">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <Meter value={progressPercent} height={4} />
        <progress
          className="sr-only"
          aria-label="Прогресс достижений"
          max={100}
          value={Math.round(progressPercent)}
        />
      </section>

      {data.achievements.length === 0 && (
        <EmptyState title="Достижений пока нет">
          Администраторы ещё не завели ни одного достижения.
        </EmptyState>
      )}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.achievements.map((a) => {
          const currentVal = a.current_progress || 0;
          const targetVal = Number(a.target_value) || 1;
          const showProgress =
            !a.is_earned && a.rule_type !== "manual" && targetVal > 0;
          return (
            <li
              key={a.id}
              className={`flex flex-col gap-3 rounded-xl border p-4 ${
                a.is_earned ? "border-line bg-surface" : "border-line-soft"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-2xl ${a.is_earned ? "" : "opacity-40 grayscale"}`}
                >
                  {a.target_image ? (
                    <img
                      src={a.target_image}
                      className="h-full w-full object-cover"
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span aria-hidden="true">{a.icon}</span>
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3
                      className={`text-sm font-medium ${a.is_earned ? "text-fg" : "text-fg-2"}`}
                    >
                      {a.name}
                    </h3>
                    <span
                      className={`shrink-0 font-mono text-[11px] ${a.is_earned ? "text-accent" : "text-fg-3"}`}
                    >
                      {a.is_earned
                        ? new Date(`${a.earned_at}Z`).toLocaleDateString(
                            "ru-RU",
                            { day: "numeric", month: "short", year: "numeric" },
                          )
                        : "Заблокировано"}
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-fg-2">
                    {renderDescriptionWithLinks(
                      a.description || "",
                      a.rule_meta ?? null,
                      a.rule_target ?? null,
                      a.name,
                    )}
                  </p>
                </div>
              </div>
              {showProgress && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between font-mono text-[11px] text-fg-3">
                    <span>прогресс</span>
                    <span>
                      {currentVal} / {targetVal}
                    </span>
                  </div>
                  <Meter value={currentVal} max={targetVal} accent={false} />
                </div>
              )}
              <span className="mt-auto font-mono text-[11px] text-fg-3">
                есть у {a.rarity ?? 0}% слушателей
                {a.reward_xp > 0 ? ` · +${a.reward_xp} XP` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
