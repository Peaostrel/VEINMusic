import assert from "node:assert/strict";
import test from "node:test";
import { load as loadFrom } from "./load-ts.mjs";

const load = (path) => loadFrom(path, import.meta.url);
const { openSocket, subscribeSocket } = await load("../app/lib/api.ts");
const {
  listeningElapsed,
  freshPlayback,
  playbackTimestamp,
  applyPlaybackUpdate,
  playbackProgress,
  playbackTime,
} = await load("../app/lib/playback.ts");
const {
  getCurrentTrack,
  loadCurrentTrack,
  publishCurrentTrack,
  subscribeCurrentTrack,
} = await load("../app/lib/nowPlayingStore.ts");

test("now playing cards share one snapshot and reject a late HTTP response", async () => {
  const username = "shared-now-playing";
  const seenBySidebar = [];
  const seenByProfile = [];
  const closeSidebar = subscribeCurrentTrack(username, (track) =>
    seenBySidebar.push(track?.title ?? "stopped"),
  );
  const closeProfile = subscribeCurrentTrack(username, (track) =>
    seenByProfile.push(track?.title ?? "stopped"),
  );
  const originalFetch = globalThis.fetch;
  let completeRequest;
  let requests = 0;
  globalThis.fetch = () => {
    requests++;
    return new Promise((resolve) => {
      completeRequest = resolve;
    });
  };
  try {
    const first = loadCurrentTrack(username);
    const second = loadCurrentTrack(username);
    assert.equal(requests, 1);
    publishCurrentTrack(
      username,
      { playing: true, title: "Live track" },
      "live:1",
    );
    completeRequest({
      ok: true,
      json: async () => ({ playing: true, title: "Old HTTP track" }),
    });
    await Promise.all([first, second]);
    assert.equal(getCurrentTrack(username).title, "Live track");
    assert.deepEqual(seenBySidebar, ["Live track"]);
    assert.deepEqual(seenByProfile, ["Live track"]);
  } finally {
    closeSidebar();
    closeProfile();
    globalThis.fetch = originalFetch;
  }
});

test("now playing clock ignores tiny rollbacks but accepts a real seek", () => {
  const username = "monotonic-now-playing";
  const base = {
    playing: true,
    title: "Track",
    artist: "Artist",
    source: "plat",
    duration: 180,
  };
  publishCurrentTrack(username, { ...base, display_position_sec: 32 });
  publishCurrentTrack(username, { ...base, display_position_sec: 31 });
  assert.ok(getCurrentTrack(username).display_position_sec >= 32);

  publishCurrentTrack(username, { ...base, display_position_sec: 10 });
  assert.equal(getCurrentTrack(username).display_position_sec, 10);
});

test("playback snapshots freeze pauses, re-anchor resumes and reject older tracks", () => {
  const start = "2026-10-15T12:00:00Z";
  const first = {
    id: 1,
    updated_at: start,
    is_playing: true,
    position_sec: 120,
    listened_sec: 15,
    likes_count: 2,
  };
  const pause = {
    ...first,
    updated_at: "2026-10-15T12:00:05Z",
    is_playing: false,
    position_sec: 125,
  };
  let history = applyPlaybackUpdate([first], pause);
  assert.equal(
    listeningElapsed(
      15,
      false,
      pause.updated_at,
      200,
      Date.parse(start) + 300000,
      history[0].position_sec,
    ),
    125,
  );
  const resume = {
    ...pause,
    updated_at: "2026-10-15T12:05:00Z",
    is_playing: true,
  };
  history = applyPlaybackUpdate(history, resume);
  assert.equal(
    listeningElapsed(
      15,
      true,
      resume.updated_at,
      200,
      Date.parse(resume.updated_at) + 2000,
      history[0].position_sec,
    ),
    127,
  );
  assert.deepEqual(applyPlaybackUpdate(history, pause), history);
  const second = {
    ...first,
    id: 2,
    position_sec: 0,
    updated_at: "2026-10-15T12:05:03Z",
  };
  history = applyPlaybackUpdate(history, second);
  assert.equal(history[0].id, 2);
  assert.equal(history[1].is_playing, false);
  assert.deepEqual(applyPlaybackUpdate(history, resume), history);
  assert.equal(playbackTime(125.9), "02:05");
});

test("history time handles UTC offsets, caps duration and stops at heartbeat expiry", () => {
  const value = "2026-10-14 12:00:00+00:00";
  const start = playbackTimestamp(value);
  assert.equal(start, playbackTimestamp("2026-10-14T12:00:00Z"));
  assert.equal(start, playbackTimestamp("2026-10-14T16:00:00+04:00"));
  assert.equal(start, playbackTimestamp("2026-10-14 12:00:00"));
  assert.equal(listeningElapsed(10, true, value, 200, start + 5000), 15);
  assert.equal(listeningElapsed(10, true, value, 200, start + 60000), 55);
  assert.equal(listeningElapsed(10, true, value, 200, start + 120000), 55);
  assert.equal(listeningElapsed(195, true, value, 200, start + 10000), 200);
  assert.equal(listeningElapsed(10, false, value, 200, start + 10000), 10);
  assert.equal(listeningElapsed(10, true, "invalid", 200, start), 10);
  // Player position (Plat Music): fractions carry, seeks/pauses show as is
  assert.equal(listeningElapsed(15, true, value, 200, start + 4500, 90.6), 95);
  assert.equal(listeningElapsed(15, false, value, 200, start + 60000, 24), 24);
  assert.equal(listeningElapsed(15, true, value, 200, start + 60000, 190), 200);
  assert.equal(listeningElapsed(15, true, value, 0, start + 10000, 300), 310);
  assert.equal(freshPlayback(value, start + 44999), true);
  assert.equal(freshPlayback(value, start + 45000), false);
});

test("player progress uses the reported position when the first report is late", () => {
  assert.equal(playbackProgress(200, 0, 0, 10), 5);
  assert.equal(playbackProgress(200, 0, 2, 10), 6);
  assert.equal(playbackProgress(200, 12, 0), 6);
  assert.equal(playbackProgress(200, 0, 0, 250), 100);
  assert.equal(playbackProgress(0, 0, 0, 10), null);
});

async function fakeBrowser(run) {
  const keys = ["window", "WebSocket", "fetch", "setTimeout", "clearTimeout"];
  const originals = Object.fromEntries(
    keys.map((key) => [key, globalThis[key]]),
  );
  const timers = new Map();
  const sockets = [];
  const tickets = [];
  let timerId = 0;
  let failTicket = false;
  class Socket extends EventTarget {
    static OPEN = 1;
    static CLOSING = 2;
    readyState = 0;
    constructor(url) {
      super();
      this.url = url;
      sockets.push(this);
    }
    emit(type, code = 1000) {
      if (type === "open") this.readyState = 1;
      if (type === "close") this.readyState = 3;
      const event = Object.assign(new Event(type), { code });
      this[`on${type}`]?.(event);
      this.dispatchEvent(event);
    }
    close() {
      this.emit("close");
    }
  }
  globalThis.window = new EventTarget();
  globalThis.WebSocket = Socket;
  globalThis.setTimeout = (fn, ms) => {
    timers.set(++timerId, { fn, ms });
    return timerId;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  globalThis.fetch = async () => {
    if (failTicket) {
      failTicket = false;
      throw new TypeError("offline");
    }
    const ticket = `ticket-${tickets.length + 1}`;
    tickets.push(ticket);
    return new Response(JSON.stringify({ ticket }));
  };
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  const retry = async () => {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    timer.fn();
    await flush();
    return timer.ms;
  };
  try {
    await run({
      sockets,
      tickets,
      timers,
      flush,
      retry,
      failNextTicket: () => {
        failTicket = true;
      },
    });
  } finally {
    for (const key of keys) globalThis[key] = originals[key];
  }
}

test("socket subscribers share one connection until the last closes", async () => {
  await fakeBrowser(async ({ sockets, flush }) => {
    const messages = [];
    const first = subscribeSocket("/ws/shared", {
      onMessage: (event) => messages.push(`first:${event.data}`),
    });
    const second = subscribeSocket("/ws/shared", {
      onMessage: (event) => messages.push(`second:${event.data}`),
    });
    await flush();
    assert.equal(sockets.length, 1);
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: "track" });
    sockets[0].dispatchEvent(event);
    assert.deepEqual(messages, ["first:track", "second:track"]);
    first.close();
    assert.equal(sockets[0].readyState, 0);
    second.close();
    assert.equal(sockets[0].readyState, 3);
  });
});

test("socket reconnect uses a fresh ticket, preserves handlers and cleans up", async () => {
  await fakeBrowser(async ({ sockets, tickets, timers, flush, retry }) => {
    let closed = 0;
    const stop = openSocket(
      "/ws/listener",
      (ws) => {
        ws.onclose = () => closed++;
      },
      { authed: true },
    );
    await flush();
    sockets[0].emit("open");
    sockets[0].emit("close", 1012);
    assert.equal(closed, 1);
    assert.equal(await retry(), 1000);
    assert.equal(sockets.length, 2);
    assert.match(sockets[1].url, /ticket=ticket-2$/);
    assert.equal(tickets.length, 2);
    sockets[1].emit("close", 1012);
    stop();
    assert.equal(timers.size, 0);
    window.dispatchEvent(new Event("online"));
    await flush();
    assert.equal(sockets.length, 2);
  });
});

test("temporary ticket failure retries authentication instead of becoming a guest", async () => {
  await fakeBrowser(
    async ({ sockets, tickets, timers, flush, retry, failNextTicket }) => {
      failNextTicket();
      const stop = openSocket("/ws/listener", () => {}, { authed: true });
      await flush();
      assert.equal(sockets.length, 0);
      assert.equal(timers.size, 1);
      await retry();
      assert.equal(tickets.length, 1);
      assert.match(sockets[0].url, /ticket=ticket-1$/);
      stop();
    },
  );
});

test("socket retry backs off and policy rejection stops the loop", async () => {
  await fakeBrowser(async ({ sockets, timers, flush, retry }) => {
    const stop = openSocket("/ws/listener", () => {});
    await flush();
    sockets[0].emit("close", 1012);
    assert.equal(await retry(), 1000);
    sockets[1].emit("close", 1012);
    assert.equal(await retry(), 2000);
    sockets[2].emit("close", 4003);
    assert.equal(timers.size, 0);
    stop();
  });
});

const { coverAt } = await load("../app/lib/coverSize.ts");

test("list covers ask music CDNs for a 2x thumbnail, never a larger one", () => {
  const y = "https://avatars.yandex.net/get-music-content/1/a.b-2/";
  assert.equal(coverAt(`${y}400x400`, 40), `${y}100x100`);
  assert.equal(coverAt(`${y}400x400`, 64), `${y}150x150`);
  assert.equal(coverAt(`${y}200x200`, 300), `${y}200x200`);
  const d = "https://cdn-images.dzcdn.net/images/cover/0af3/";
  assert.equal(
    coverAt(`${d}1000x1000-000000-80-0-0.jpg`, 48),
    `${d}120x120-000000-80-0-0.jpg`,
  );
  const s = "https://i1.sndcdn.com/artworks-wczEc-NqAYaA-";
  assert.equal(coverAt(`${s}t500x500.jpg`, 40), `${s}large.jpg`);
  assert.equal(coverAt(`${s}t500x500.jpg`, 120), `${s}t300x300.jpg`);
  assert.equal(coverAt(`${s}large.jpg`, 200), `${s}large.jpg`);
  const other = "https://api.music.vein.guru/uploads/abc.jpg";
  assert.equal(coverAt(other, 40), other);
  assert.equal(coverAt(null, 40), null);
});
