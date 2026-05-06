'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);

export default function Developers() {
  const [copied, setCopied] = useState('');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const jsonExample = `{
  "api_key": "твой_секретный_ключ",
  "title": "Worthless I, Worthless You",
  "artist": "LAZZY2WICE",
  "source": "custom_script",
  "progress_sec": 15,
  "duration": 69,
  "is_playing": true,
  "cover_url": "https://...",
  "track_url": "https://..."
}`;

  const pythonExample = `import requests

url = "https://api.music.vein.guru/api/scrobble"
payload = {
    "api_key": "твой_секретный_ключ",
    "title": "Демиург",
    "artist": "Джизус",
    "source": "python_bot",
    "duration": 180,
    "progress_sec": 10,
    "is_playing": True
}

response = requests.post(url, json=payload)
print(response.json())`;

  const curlExample = `curl -X POST https://api.music.vein.guru/api/scrobble \\
-H "Content-Type: application/json" \\
-d '{
  "api_key": "твой_секретный_ключ",
  "title": "Всё забрать",
  "artist": "Джизус",
  "source": "terminal"
}'`;

  const getUserExample = `import requests

username = "peaostrel"
url = f"https://api.music.vein.guru/api/user/{username}"

response = requests.get(url)
data = response.json()

print(f"Пользователь: {data['display_name']}")
print(f"Ранг: {data['role']}")
print(f"Стрик: {data['streak']} дней")`;

  const CodeBlock = ({ code, language, label, colorClass, id }: { code: string; language: string; label: string; colorClass?: string; id: string }) => (
    <div className="mb-8 group/block">
      <div className="flex items-center justify-between bg-[#1e252b] px-4 py-2.5 rounded-t-xl border border-white/5 border-b-0">
        <span className={`text-xs font-bold ${colorClass || 'text-gray-400'}`}>{label}</span>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          {copied === id ? '✅ Скопировано' : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
              Копировать
            </>
          )}
        </button>
      </div>
      <div className="relative overflow-hidden rounded-b-xl border border-white/5 shadow-2xl">
        <SyntaxHighlighter
          language={language}
          style={atomOneDark}
          customStyle={{
            margin: 0,
            padding: '20px',
            fontSize: '14px',
            lineHeight: '1.6',
            backgroundColor: '#161b22',
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace'
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pt-24 min-h-screen text-white pb-32">
      <div className="mb-12">
        <div className="inline-block bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4 shadow-[0_0_15px_var(--accent-glow)]">
          VEIN API v1.0
        </div>
        <h1 className="text-5xl font-black text-white mb-4 drop-shadow-xl tracking-tight">Для разработчиков</h1>
        <p className="text-gray-400 text-lg max-w-2xl leading-relaxed">
          Подключи свой любимый плеер или Discord-бота к VEIN Music. Отправляй прослушивания и получай статистику через открытый эндпоинт.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-12">

        <section>
          <h2 className="text-2xl font-black text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center text-[#121212] text-sm">1</span>
            Аутентификация
          </h2>
          <div className="bg-[#121212]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-300 text-sm leading-relaxed">
              Для POST-запросов используй свой <code>api_key</code>. Публичные GET-запросы работают без ключа.
            </p>
            <Link href="/settings" className="bg-white/5 hover:bg-[var(--accent)] hover:text-[#121212] px-5 py-2.5 rounded-xl font-bold text-sm transition-all border border-white/10 shrink-0 whitespace-nowrap">
              Найти мой ключ
            </Link>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
            <span className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center text-[#121212] text-sm">2</span>
            Эндпоинты (REST API)
          </h2>
          <div className="bg-[#121212]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-white/5 text-white font-bold uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3">Метод</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Описание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3"><span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-bold">GET</span></td>
                    <td className="px-4 py-3"><code>/api/user/:username</code></td>
                    <td className="px-4 py-3">Получить профиль, аватар и текущий статус</td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3"><span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-bold">GET</span></td>
                    <td className="px-4 py-3"><code>/api/leaderboard</code></td>
                    <td className="px-4 py-3">Топ игроков по XP</td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3"><span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs font-bold">POST</span></td>
                    <td className="px-4 py-3"><code>/api/scrobble</code></td>
                    <td className="px-4 py-3">Отправить трек в историю (нужен <code>api_key</code>)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center text-[#121212] text-sm">3</span>
            Описание полей (Scrobble)
          </h2>
          <div className="bg-[#121212]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 space-y-3">
             <div className="flex items-center gap-2"><code className="text-[var(--accent)] font-bold">api_key</code> <span className="text-gray-400 text-sm">- Твой секретный ключ для авторизации (строка).</span></div>
             <div className="flex items-center gap-2"><code className="text-white font-bold">title</code> <span className="text-gray-400 text-sm">- Название трека (обязательное).</span></div>
             <div className="flex items-center gap-2"><code className="text-white font-bold">artist</code> <span className="text-gray-400 text-sm">- Имя исполнителя (обязательное).</span></div>
             <div className="flex items-center gap-2"><code className="text-white font-bold">source</code> <span className="text-gray-400 text-sm">- Источник (например: <code>discord_rpc</code>, <code>custom_script</code>).</span></div>
             <div className="flex items-center gap-2"><code className="text-white font-bold">duration</code> <span className="text-gray-400 text-sm">- Длина треки в секундах (число).</span></div>
             <div className="flex items-center gap-2"><code className="text-white font-bold">is_playing</code> <span className="text-gray-400 text-sm">- Играет ли трек прямо сейчас (boolean).</span></div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
            <span className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center text-[#121212] text-sm">4</span>
            Примеры кода
          </h2>

          <CodeBlock
            id="json"
            label="JSON Structure (POST)"
            language="json"
            code={jsonExample}
            colorClass="text-yellow-400"
          />

          <CodeBlock
            id="python"
            label="Python requests (Scrobble)"
            language="python"
            code={pythonExample}
            colorClass="text-blue-400"
          />

          <CodeBlock
            id="pythonget"
            label="Python requests (Get Profile)"
            language="python"
            code={getUserExample}
            colorClass="text-blue-400"
          />

          <CodeBlock
            id="curl"
            label="cURL (POST)"
            language="bash"
            code={curlExample}
            colorClass="text-gray-400"
          />
        </section>

      </div>
    </div>
  );
}
