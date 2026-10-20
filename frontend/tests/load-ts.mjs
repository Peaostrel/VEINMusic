import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Transpiles a TypeScript module and its relative imports into data: URLs
async function moduleUrl(url) {
  const source = await readFile(url, "utf8");
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  for (const [, spec] of outputText.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
    const dep = await moduleUrl(new URL(`${spec}.ts`, url));
    outputText = outputText.replace(`"${spec}"`, `"${dep}"`);
  }
  // Packages (react): a data: URL cannot resolve them by name
  for (const [, spec] of outputText.matchAll(
    /from "((?!data:)[a-z@][^"]*)"/g,
  )) {
    const file = pathToFileURL(require.resolve(spec)).href;
    outputText = outputText.replace(`"${spec}"`, `"${file}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
/** Imports a TypeScript module of the app, path relative to the caller. */
export const load = async (path, base) =>
  import(await moduleUrl(new URL(path, base)));
