import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Suspense, use } from "react";
import { renderToReadableStream } from "react-dom/server";
import { load } from "./load-ts.mjs";

const { tr, setActiveTranslator } = await load(
  "../app/lib/i18n/active.ts",
  import.meta.url,
);
const { LangContext } = await load(
  "../app/lib/i18n/context.ts",
  import.meta.url,
);
const { makeTranslator } = await load(
  "../app/lib/i18n/core.ts",
  import.meta.url,
);

const EN = makeTranslator("en", { Привет: "Hello" });
const RU = makeTranslator("ru", null);

// A helper called while rendering, after the render was suspended once
function Label({ wait }) {
  use(wait);
  return createElement("p", null, tr("Привет"));
}

async function render(t, wait) {
  const stream = await renderToReadableStream(
    createElement(
      LangContext.Provider,
      { value: t },
      createElement(
        Suspense,
        { fallback: "…" },
        createElement(Label, { wait }),
      ),
    ),
  );
  await stream.allReady;
  return new Response(stream).text();
}

test("helpers translate for the request being rendered, not the last provider", async () => {
  let release;
  const wait = new Promise((resolve) => (release = resolve));
  const english = render(EN, wait);
  // Another visitor's render replaces the shared fallback meanwhile
  setActiveTranslator(RU);
  const russian = render(RU, Promise.resolve());
  release();
  assert.match(await english, /Hello/);
  assert.match(await russian, /Привет/);
});

test("outside a render the shared translator is used", () => {
  setActiveTranslator(EN);
  assert.equal(tr("Привет"), "Hello");
  setActiveTranslator(RU);
  assert.equal(tr("Привет"), "Привет");
});
