import { use } from "react";
import { LangContext } from "./context";
import { makeTranslator, type Translator, type Vars } from "./core";

/*
 * The translator of code outside components (helpers in app/lib, toasts).
 * LangProvider sets it while it renders; in the browser there is a single
 * visitor, so it is always theirs. On the server several visitors render
 * at once, so a helper called while a Client Component renders reads the
 * request's own translator from the context; `active` is only a fallback
 * there (Server Components take theirs from `getT()`).
 */
let active: Translator = makeTranslator("ru", null);

function renderingTranslator(): Translator | null {
  if (typeof window !== "undefined" || !LangContext) return null;
  try {
    // Deliberately outside a hook: helpers run inside many renders; outside
    // one React throws, which the catch turns into the fallback
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return use(LangContext);
  } catch {
    // Not inside a render (route handlers, module code)
    return null;
  }
}

export const activeTranslator = () => renderingTranslator() ?? active;
export const setActiveTranslator = (t: Translator) => {
  active = t;
};

/** Translate outside a component. */
export const tr = (ru: string, vars?: Vars) => activeTranslator()(ru, vars);
export const currentLang = () => activeTranslator().lang;
export const currentLocale = () => activeTranslator().locale;
export const pluralize = (n: number, one: string, few: string, many: string) =>
  activeTranslator().plural(n, one, few, many);
