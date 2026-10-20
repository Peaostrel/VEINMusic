import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import ts from "typescript";

const source = await readFile(
  new URL("../app/lib/historyTransfer.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { parseHistoryText, readHistoryFiles } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const spotify = [
  {
    ts: "2024-03-01T12:03:00Z",
    ms_played: 180000,
    master_metadata_track_name: "Song",
    master_metadata_album_artist_name: "Artist",
    master_metadata_album_album_name: "Album",
  },
  // Skip, podcast episode and video are not plays.
  {
    ts: "2024-03-01T12:04:00Z",
    ms_played: 5000,
    master_metadata_track_name: "Skipped",
    master_metadata_album_artist_name: "Artist",
  },
  {
    ts: "2024-03-01T13:00:00Z",
    ms_played: 900000,
    master_metadata_track_name: null,
    episode_name: "Podcast",
  },
];

test("Spotify extended history becomes plays that start before ts", () => {
  const rows = parseHistoryText("Streaming_History_Audio_2024.json", JSON.stringify(spotify));
  assert.deepEqual(rows, [
    {
      played_at: "2024-03-01T12:00:00.000Z",
      artist: "Artist",
      title: "Song",
      album: "Album",
      listened_sec: 180,
      source: "spotify_import",
    },
  ]);
});

test("Spotify account data and ListenBrainz JSON Lines are read", () => {
  const account = parseHistoryText(
    "StreamingHistory_music_0.json",
    JSON.stringify([
      { endTime: "2023-05-02 10:05", artistName: "A", trackName: "T", msPlayed: 300000 },
    ]),
  );
  assert.equal(account[0].played_at, "2023-05-02T10:00:00.000Z");
  const listens = parseHistoryText(
    "listens/2024/3.jsonl",
    [
      { listened_at: 1709294400, track_metadata: { artist_name: "LB", track_name: "One", release_name: "R", additional_info: { duration_ms: 200000 } } },
      { listened_at: 1709294700, track_metadata: { artist_name: "LB", track_name: "Two" } },
    ].map((row) => JSON.stringify(row)).join("\n"),
  );
  assert.equal(listens.length, 2);
  assert.equal(listens[0].played_at, "2024-03-01T12:00:00.000Z");
  assert.equal(listens[0].duration, 200);
  assert.equal(listens[1].source, "listenbrainz_import");
});

test("VEIN exports pass through and unknown JSON is not history", () => {
  const vein = [{ played_at: "2024-01-01T00:00:00Z", artist: "A", title: "T" }];
  assert.deepEqual(parseHistoryText("export.json", JSON.stringify({ scrobbles: vein })), vein);
  assert.equal(parseHistoryText("Playlist1.json", JSON.stringify({ playlists: [] })), null);
  assert.equal(parseHistoryText("Follow.json", JSON.stringify([{ name: "x" }])), null);
});

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(raw.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(header, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("a Spotify ZIP is read whole, skipping unrelated files", async () => {
  const later = { ...spotify[0], ts: "2024-03-02T12:03:00Z", master_metadata_track_name: "Later" };
  const archive = zip([
    ["Spotify Extended Streaming History/Streaming_History_Audio_2024_1.json", JSON.stringify([later])],
    ["Spotify Extended Streaming History/ReadMeFirst.pdf", "%PDF"],
    ["Spotify Extended Streaming History/Streaming_History_Video_2024.json", JSON.stringify([{ ts: "2024-01-01T00:00:00Z", ms_played: 60000, master_metadata_track_name: null }])],
    ["Spotify Extended Streaming History/Streaming_History_Audio_2024_0.json", JSON.stringify(spotify)],
    ["Userdata.json", JSON.stringify({ username: "x" })],
  ]);
  const rows = await readHistoryFiles([new File([archive], "my_spotify_data.zip")]);
  assert.deepEqual(rows.map((row) => row.title), ["Song", "Later"]);
});

test("a file with no plays is reported", async () => {
  await assert.rejects(
    readHistoryFiles([new File([JSON.stringify(spotify.slice(1))], "a.json")]),
    /30 секунд/,
  );
  await assert.rejects(
    readHistoryFiles([new File(["{\"x\":1}"], "a.json")]),
    /распознать/,
  );
});
