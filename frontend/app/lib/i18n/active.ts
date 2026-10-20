import { makeTranslator, type Translator, type Vars } from "./core";

/*
 * The translator of code outside components (helpers in app/lib, toasts).
 * LangProvider sets it while it renders; in the browser there is a single
 * visitor, so it is always theirs. On the server it is only a fallback:
 * Server Components take their translator from `getT()`.
 */
let active: Translator = makeTranslator("ru", null);

export const activeTranslator = () => active;
export const setActiveTranslator = (t: Translator) => {
  active = t;
};

/** Translate outside a component. */
export const tr = (ru: string, vars?: Vars) => active(ru, vars);
export const currentLang = () => active.lang;
export const currentLocale = () => active.locale;
export const pluralize = (n: number, one: string, few: string, many: string) =>
  active.plural(n, one, few, many);
