#!/usr/bin/env node
/**
 * Checks the English dictionary against the code.
 *
 *   node scripts/i18n-check.mjs              all of app/ and components/
 *   node scripts/i18n-check.mjs app/settings only these paths
 *   --untranslated   also list lines with Russian text outside t()/tr()
 *
 * Fails when a t("…"), tr("…"), msg("…") or plural(n, "…", "…", "…") literal has no
 * entry in app/lib/i18n/en/*.json.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const showUntranslated = args.includes("--untranslated");
const targets = args.filter((a) => !a.startsWith("--"));
const paths = (targets.length ? targets : ["app", "components", "utils"]).map(
  (p) => join(root, p),
);

const dictDir = join(root, "app/lib/i18n/en");
const dict = {};
for (const name of readdirSync(dictDir)) {
  if (name.endsWith(".json")) {
    Object.assign(dict, JSON.parse(readFileSync(join(dictDir, name), "utf8")));
  }
}

function* files(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      yield* files(join(path, name));
    }
  } else if (/\.(tsx?|mjs)$/.test(path) && !path.includes("/i18n/")) {
    yield path;
  }
}

const unescape = (s) => s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");
const STRING = String.raw`("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60)`;
const CALL = new RegExp(String.raw`(?<![\w.])(?:t|tr|msg)\(\s*` + STRING, "g");
const PLURAL = new RegExp(
  String.raw`(?:plural|pluralize)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*${STRING}\s*,\s*${STRING}\s*,\s*${STRING}`,
  "g",
);

let missing = 0;
let untranslated = 0;
for (const base of paths) {
  for (const file of files(base)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file);
    const lineOf = (index) => text.slice(0, index).split("\n").length;
    const check = (key, index) => {
      if (!/[А-Яа-яЁё]/.test(key)) return;
      if (key.includes("${")) {
        console.log(
          `${rel}:${lineOf(index)}: template key, use {name}: ${key}`,
        );
        missing++;
      } else if (!(key in dict)) {
        console.log(
          `${rel}:${lineOf(index)}: no translation: ${JSON.stringify(key)}`,
        );
        missing++;
      }
    };
    let stripped = text;
    for (const m of text.matchAll(CALL)) {
      check(unescape(m[1].slice(1, -1)), m.index);
      stripped = stripped.replace(m[1], '""');
    }
    for (const m of text.matchAll(PLURAL)) {
      const forms = [m[1], m[2], m[3]].map((s) => unescape(s.slice(1, -1)));
      check(forms.join("|"), m.index);
      for (const s of [m[1], m[2], m[3]]) stripped = stripped.replace(s, '""');
    }
    if (showUntranslated) {
      stripped.split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$|\/\*.*?\*\/|\{\/\*.*?\*\/\}/g, "");
        if (/^\s*(\*|\/\*)/.test(code)) return;
        if (/[А-Яа-яЁё]/.test(code)) {
          console.log(`${rel}:${i + 1}: russian outside t(): ${line.trim()}`);
          untranslated++;
        }
      });
    }
  }
}
console.log(
  `${missing} missing translation(s)` +
    (showUntranslated
      ? `, ${untranslated} line(s) with russian outside t()`
      : ""),
);
process.exit(missing ? 1 : 0);
