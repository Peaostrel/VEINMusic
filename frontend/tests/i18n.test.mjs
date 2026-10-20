import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/lib/i18n/core.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { makeTranslator } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const dict = {
  "Новых: {n}": "New: {n}",
  "трек|трека|треков": "track|tracks",
};

test("Russian is the source and the fallback", () => {
  const ru = makeTranslator("ru", dict);
  assert.equal(ru("Новых: {n}", { n: 3 }), "Новых: 3");
  assert.equal(ru.plural(3, "трек", "трека", "треков"), "трека");
  assert.equal(ru.plural(11, "трек", "трека", "треков"), "треков");
  const en = makeTranslator("en", dict);
  assert.equal(en("Новых: {n}", { n: 3 }), "New: 3");
  assert.equal(en("Нет перевода"), "Нет перевода");
  assert.equal(en.plural(1, "трек", "трека", "треков"), "track");
  assert.equal(en.plural(21, "трек", "трека", "треков"), "tracks");
  assert.equal(en.number(1482906), "1,482,906");
  assert.equal(en.locale, "en-US");
});

test("every t(), tr(), msg() and plural() literal has an English entry", () => {
  const script = new URL("../scripts/i18n-check.mjs", import.meta.url);
  const out = execFileSync(process.execPath, [script.pathname], {
    encoding: "utf8",
  });
  assert.match(out, /^0 missing translation/m);
});
