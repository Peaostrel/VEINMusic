// Settings window of VEINMusic for Windows. Talks to the app through Tauri
// commands (src-tauri/src/lib.rs) and redraws on its "state" events.
"use strict";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);

// Russian on Russian-speaking systems (ru, uk, be, kk), English otherwise.
// The app reports its own choice in state.lang; until the first state
// arrives the window's language decides.
const STRINGS = {
  ru: {
    title: "Настройки VEINMusic",
    download: "Скачать",
    account: "Аккаунт",
    connectHint: "Подключите аккаунт VEINMusic, чтобы музыка с этого компьютера попадала в ваш профиль.",
    connect: "Подключить аккаунт",
    pairingHint:
      "Страница подтверждения открыта в окне VEINMusic. Проверьте, что там этот код, и нажмите «Подключить».",
    cancel: "Отмена",
    profile: "Профиль",
    disconnect: "Отключить",
    nowPlaying: "Сейчас играет",
    scrobbling: "Скробблинг",
    foot: "Окно VEINMusic можно закрыть: приложение останется в трее и продолжит скробблить.",
    accountConnected: "Аккаунт подключён",
    nothingPlaying: "Ничего не играет. Включите музыку в Spotify, приложении Яндекс Музыки, AIMP или другом плеере.",
    scrobblingOff: "Скробблинг выключен",
    notSent: "Не отправляется: аккаунт не подключён",
    updateAvailable: (v) => `Доступна версия ${v}`,
    toggles: {
      scrobbling: ["Скробблинг", "Отправлять прослушивания в профиль VEINMusic"],
      "sources.spotify": ["Spotify", "Приложение Spotify для Windows"],
      "sources.yandex": [
        "Яндекс Музыка",
        "Приложение. Если Яндекс подключён на сайте, он уже скробблится напрямую — не включайте, иначе прослушивания задвоятся",
      ],
      "sources.browsers": [
        "Браузеры",
        "Вкладки с музыкой в Chrome, Edge, Яндекс Браузере. Если стоит расширение VEIN, не включайте",
      ],
      "sources.other": ["Другие плееры", "AIMP, foobar2000, VLC, Apple Music, MusicBee и другие"],
      discord: ["Статус в Discord", "Показывать в Discord, что вы слушаете"],
      autostart: ["Запускать вместе с Windows", "Иначе прослушивания считаются, только пока приложение открыто"],
    },
  },
  en: {
    title: "VEINMusic settings",
    download: "Download",
    account: "Account",
    connectHint: "Connect your VEINMusic account so that music from this computer goes to your profile.",
    connect: "Connect account",
    pairingHint:
      "The confirmation page is open in the VEINMusic window. Check that it shows this code and click “Connect”.",
    cancel: "Cancel",
    profile: "Profile",
    disconnect: "Disconnect",
    nowPlaying: "Now playing",
    scrobbling: "Scrobbling",
    foot: "You can close the VEINMusic window: the app stays in the tray and keeps scrobbling.",
    accountConnected: "Account connected",
    nothingPlaying: "Nothing is playing. Play music in Spotify, the Yandex Music app, AIMP or another player.",
    scrobblingOff: "Scrobbling is off",
    notSent: "Not sent: no account connected",
    updateAvailable: (v) => `Version ${v} is available`,
    toggles: {
      scrobbling: ["Scrobbling", "Send your plays to your VEINMusic profile"],
      "sources.spotify": ["Spotify", "The Spotify app for Windows"],
      "sources.yandex": [
        "Yandex Music",
        "The app. If Yandex is connected on the site, it is already scrobbled directly — leave this off, or plays will be counted twice",
      ],
      "sources.browsers": [
        "Browsers",
        "Music tabs in Chrome, Edge, Yandex Browser. Leave this off if the VEIN extension is installed",
      ],
      "sources.other": ["Other players", "AIMP, foobar2000, VLC, Apple Music, MusicBee and others"],
      discord: ["Discord status", "Show in Discord what you are listening to"],
      autostart: ["Start with Windows", "Otherwise plays are only counted while the app is open"],
    },
  },
};

const RUSSIAN_SPEAKING = ["ru", "uk", "be", "kk"];

function systemLang() {
  const tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  const primary = String(tags[0] || "").toLowerCase().split(/[-_]/)[0];
  return RUSSIAN_SPEAKING.includes(primary) ? "ru" : "en";
}

let lang = systemLang();
const t = () => STRINGS[lang];

function applyStatic() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t()[el.dataset.i18n];
  }
}

// Logic values (names) stay the same in both languages; texts come from STRINGS.
const TOGGLES = [
  { name: "scrobbling" },
  { name: "sources.spotify", sub: true },
  { name: "sources.yandex", sub: true },
  { name: "sources.browsers", sub: true },
  { name: "sources.other", sub: true },
  { name: "discord", discord: true },
  { name: "autostart" },
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
  $("username").textContent = state.username ? `@${state.username}` : t().accountConnected;
  $("profile").disabled = !state.username;
}

function renderNow() {
  const box = $("now");
  box.replaceChildren();
  const np = state.now_playing;
  if (!np) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = t().nothingPlaying;
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
    note.textContent = state.paired ? t().scrobblingOff : t().notSent;
    box.append(note);
  }
}

function renderToggles() {
  const box = $("toggles");
  box.replaceChildren();
  for (const toggle of TOGGLES) {
    const [labelText, hintText] = t().toggles[toggle.name];
    if (toggle.discord && !state.discord_available) continue;
    const row = document.createElement("div");
    row.className = toggle.sub ? "toggle sub" : "toggle";
    const text = document.createElement("span");
    text.className = "text";
    const label = document.createElement("span");
    label.id = `label-${toggle.name}`;
    label.textContent = labelText;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = hintText;
    text.append(label, hint);

    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-labelledby", label.id);
    const on = Boolean(optionValue(toggle.name));
    sw.setAttribute("aria-checked", String(on));
    sw.disabled = busy || (toggle.sub && !state.settings.scrobbling);
    sw.addEventListener("click", () => setOption(toggle.name, !on));
    row.append(text, sw);
    box.append(row);
  }
}

function render() {
  if (!state) return;
  if (STRINGS[state.lang] && state.lang !== lang) {
    lang = state.lang;
    applyStatic();
  }
  $("version").textContent = `v${state.version}`;
  show($("update"), Boolean(state.update));
  if (state.update) $("update-text").textContent = t().updateAvailable(state.update.version);
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

applyStatic();

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
