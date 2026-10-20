import type { Lang } from "@/app/lib/i18n/core";

const TEXT = {
  ru: {
    playing: "Сейчас играет",
    last: "Последний трек",
    nothing: "Пока ничего не слушали",
    week: "За 7 дней",
    plays: ["прослушивание", "прослушивания", "прослушиваний"],
    minutes: "мин",
    topArtist: "Артист недели",
    keyError: "Ключ не подошёл. Создайте новый на music.vein.guru/widget",
    offline: "Нет связи с VEIN Music",
  },
  en: {
    playing: "Now playing",
    last: "Last played",
    nothing: "Nothing played yet",
    week: "Last 7 days",
    plays: ["play", "plays", "plays"],
    minutes: "min",
    topArtist: "Artist of the week",
    keyError: "The key didn't work. Create a new one at music.vein.guru/widget",
    offline: "Can't reach VEIN Music",
  },
};

/**
 * Scriptable (https://scriptable.app) script for an iPhone home or lock
 * screen widget. Run from the Shortcuts app or Siri it answers in a sentence.
 * The key is a read-only one made for the widget on /widget.
 */
export function widgetScript(
  apiUrl: string,
  siteUrl: string,
  key: string,
  lang: Lang,
) {
  const text = JSON.stringify(TEXT[lang], null, 2);
  return `// VEIN Music widget for Scriptable — ${siteUrl}/widget
const API = ${JSON.stringify(apiUrl)};
const SITE = ${JSON.stringify(siteUrl)};
const KEY = ${JSON.stringify(key)};
const T = ${text};

function plural(n, forms) {
  const m10 = n % 10, m100 = n % 100;
  if (forms[0] === "play") return n === 1 ? forms[0] : forms[1];
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

async function load() {
  const req = new Request(API + "/api/widgets/me/summary");
  req.headers = { "X-API-Key": KEY };
  req.timeoutInterval = 15;
  try {
    const data = await req.loadJSON();
    if (req.response.statusCode === 401 || req.response.statusCode === 403) {
      return { error: T.keyError };
    }
    if (req.response.statusCode !== 200) return { error: T.offline };
    return data;
  } catch (e) {
    return { error: T.offline };
  }
}

async function image(url) {
  if (!url) return null;
  try {
    return await new Request(url.startsWith("/") ? API + url : url).loadImage();
  } catch (e) {
    return null;
  }
}

function weekLine(week) {
  return T.week + ": " + week.plays + " " + plural(week.plays, T.plays) +
    " · " + week.minutes + " " + T.minutes;
}

const data = await load();
const family = config.widgetFamily || "medium";
const w = new ListWidget();
w.backgroundColor = new Color("#0e0f10");
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
w.url = data.username ? SITE + "/user/" + encodeURIComponent(data.username) : SITE;

if (family.startsWith("accessory")) {
  // Lock screen: text only, the system tints it
  if (data.error) {
    w.addText(data.error).font = Font.systemFont(11);
  } else if (family === "accessoryCircular") {
    const n = w.addText(String(data.week.plays));
    n.font = Font.boldSystemFont(18);
    n.centerAlignText();
    const l = w.addText(plural(data.week.plays, T.plays));
    l.font = Font.systemFont(9);
    l.centerAlignText();
  } else if (data.now) {
    const t = w.addText("♫ " + data.now.title);
    t.font = Font.boldSystemFont(13);
    t.lineLimit = 1;
    if (family === "accessoryRectangular") {
      const a = w.addText(data.now.artist || "");
      a.font = Font.systemFont(12);
      a.lineLimit = 1;
      w.addText(weekLine(data.week)).font = Font.systemFont(10);
    }
  } else {
    w.addText(T.nothing).font = Font.systemFont(12);
  }
} else if (data.error) {
  const e = w.addText(data.error);
  e.font = Font.systemFont(13);
  e.textColor = new Color("#a1a1aa");
} else {
  const head = w.addStack();
  const brand = head.addText("VEIN");
  brand.font = Font.heavySystemFont(11);
  brand.textColor = new Color("#ef4444");
  head.addSpacer();
  if (data.now) {
    const status = head.addText(data.now.is_playing ? T.playing : T.last);
    status.font = Font.mediumSystemFont(10);
    status.textColor = new Color("#71717a");
  }
  w.addSpacer(8);

  if (data.now) {
    const row = w.addStack();
    row.centerAlignContent();
    const cover = family === "small" ? null : await image(data.now.cover_url);
    if (cover) {
      const img = row.addImage(cover);
      img.imageSize = new Size(52, 52);
      img.cornerRadius = 8;
      row.addSpacer(10);
    }
    const info = row.addStack();
    info.layoutVertically();
    const title = info.addText(data.now.title || "");
    title.font = Font.boldSystemFont(14);
    title.textColor = Color.white();
    title.lineLimit = 2;
    const artist = info.addText(data.now.artist || "");
    artist.font = Font.systemFont(12);
    artist.textColor = new Color("#a1a1aa");
    artist.lineLimit = 1;
  } else {
    const none = w.addText(T.nothing);
    none.font = Font.systemFont(13);
    none.textColor = new Color("#a1a1aa");
  }

  w.addSpacer();
  const week = w.addText(weekLine(data.week));
  week.font = Font.systemFont(11);
  week.textColor = new Color("#a1a1aa");
  if (family !== "small" && data.week.top_artist) {
    const top = w.addText(T.topArtist + ": " + data.week.top_artist);
    top.font = Font.systemFont(11);
    top.textColor = new Color("#a1a1aa");
    top.lineLimit = 1;
  }
}

let say = data.error || T.nothing;
if (!data.error && data.now) {
  say = (data.now.is_playing ? T.playing : T.last) + ": " +
    (data.now.artist ? data.now.artist + " — " : "") + data.now.title + ". " +
    weekLine(data.week) + ".";
}
// Shortcuts and Siri get a sentence back ("Run Script" action output)
Script.setShortcutOutput(say);
if (config.runsInWidget) {
  Script.setWidget(w);
} else if (config.runsInApp) {
  await w.presentMedium();
}
Script.complete();
`;
}
