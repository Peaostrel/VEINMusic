import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const { openSocket } = await load("../app/lib/api.ts");
const { listeningElapsed, freshPlayback, playbackTimestamp } = await load(
  "../app/lib/playback.ts",
);

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
