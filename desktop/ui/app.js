// Settings window of VEINMusic for Windows. Talks to the app through Tauri
// commands (src-tauri/src/lib.rs) and redraws on its "state" events.
"use strict";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);

const TOGGLES = [
  { name: "scrobbling", label: "Скробблинг", hint: "Отправлять прослушивания в профиль VEINMusic" },
  { name: "sources.spotify", label: "Spotify", hint: "Приложение Spotify для Windows", sub: true },
  {
    name: "sources.yandex",
    label: "Яндекс Музыка",
    hint: "Приложение. Если Яндекс подключён на сайте, он уже скробблится напрямую — не включайте, иначе прослушивания задвоятся",
    sub: true,
  },
  {
    name: "sources.browsers",
    label: "Браузеры",
    hint: "Вкладки с музыкой в Chrome, Edge, Яндекс Браузере. Если стоит расширение VEIN, не включайте",
    sub: true,
  },
  { name: "sources.other", label: "Другие плееры", hint: "AIMP, foobar2000, VLC, Apple Music, MusicBee и другие", sub: true },
  { name: "discord", label: "Статус в Discord", hint: "Показывать в Discord, что вы слушаете", discord: true },
  { name: "autostart", label: "Запускать вместе с Windows", hint: "Иначе прослушивания считаются, только пока приложение открыто" },
];

let state = null;
let busy = false;

function optionValue(name) {
  if (name === "autostart") return state.autostart;
  if (name.startsWith("sources.")) return state.settings.sources[name.slice(8)];
  return state.settings[name];
}

function show(el, visible) {
  el.hidden = !visible;
}

function renderAccount() {
  show($("account-none"), !state.paired && !state.pairing);
  show($("account-pairing"), Boolean(state.pairing));
  show($("account-ready"), state.paired && !state.pairing);
  if (state.pairing) $("code").textContent = state.pairing.user_code;
  $("username").textContent = state.username ? `@${state.username}` : "Аккаунт подключён";
  $("profile").disabled = !state.username;
}

function renderNow() {
  const box = $("now");
  box.replaceChildren();
  const np = state.now_playing;
  if (!np) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Ничего не играет. Включите музыку в Spotify, приложении Яндекс Музыки, AIMP или другом плеере.";
    box.append(empty);
    return;
  }
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = np.title;
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = np.artist;
  const player = document.createElement("span");
  player.className = "player";
  player.textContent = np.player;
  box.append(title, meta, player);
  if (!state.paired || !state.settings.scrobbling) {
    const note = document.createElement("span");
    note.className = "meta";
    note.textContent = state.paired ? "Скробблинг выключен" : "Не отправляется: аккаунт не подключён";
    box.append(note);
  }
}

function renderToggles() {
  const box = $("toggles");
  box.replaceChildren();
  for (const t of TOGGLES) {
    if (t.discord && !state.discord_available) continue;
    const row = document.createElement("div");
    row.className = t.sub ? "toggle sub" : "toggle";
    const text = document.createElement("span");
    text.className = "text";
    const label = document.createElement("span");
    label.id = `label-${t.name}`;
    label.textContent = t.label;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = t.hint;
    text.append(label, hint);

    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-labelledby", label.id);
    const on = Boolean(optionValue(t.name));
    sw.setAttribute("aria-checked", String(on));
    sw.disabled = busy || (t.sub && !state.settings.scrobbling);
    sw.addEventListener("click", () => setOption(t.name, !on));
    row.append(text, sw);
    box.append(row);
  }
}

function render() {
  if (!state) return;
  $("version").textContent = `v${state.version}`;
  show($("update"), Boolean(state.update));
  if (state.update) $("update-text").textContent = `Доступна версия ${state.update.version}`;
  show($("message"), Boolean(state.message));
  $("message").textContent = state.message || "";
  renderAccount();
  renderNow();
  renderToggles();
}

async function run(command, args) {
  busy = true;
  render();
  try {
    state = await invoke(command, args);
  } catch (e) {
    state = { ...state, message: String(e) };
  } finally {
    busy = false;
    render();
  }
}

function setOption(name, value) {
  return run("set_option", { name, value });
}

$("pair").addEventListener("click", () => run("start_pairing"));
$("cancel").addEventListener("click", () => run("cancel_pairing"));
$("logout").addEventListener("click", () => run("logout"));
$("profile").addEventListener("click", () => invoke("open_site", { path: `/user/${state.username}` }));
$("update-open").addEventListener("click", () => invoke("open_update"));

listen("state", (event) => {
  state = event.payload;
  render();
});
invoke("get_state").then((s) => {
  state = s;
  render();
});
