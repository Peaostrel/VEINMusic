import type { Messages } from "../core";
import admin from "./admin.json";
import backend from "./backend.json";
import legal from "./legal.json";
import library from "./library.json";
import profile from "./profile.json";
import settings from "./settings.json";
import shell from "./shell.json";

/**
 * English dictionary: Russian source text → English. One file per part of
 * the site; backend.json holds the API's error messages, which the client
 * translates when it shows them.
 */
const en: Messages = {
  ...backend,
  ...shell,
  ...legal,
  ...library,
  ...profile,
  ...settings,
  ...admin,
};

export default en;
