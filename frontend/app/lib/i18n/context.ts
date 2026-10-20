import * as React from "react";
import { makeTranslator, type Translator } from "./core";

/*
 * The context LangProvider fills. It lives in a plain module so the
 * translator of code outside components (active.ts) can read it while a
 * Client Component renders on the server. The react-server build has no
 * createContext: there Server Components use getT() and this stays null.
 */
export const LangContext: React.Context<Translator> | null =
  typeof React.createContext === "function"
    ? React.createContext<Translator>(makeTranslator("ru", null))
    : null;
