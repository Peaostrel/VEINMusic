import { msg } from "@/app/lib/i18n/core";

/**
 * Who answers for personal data, quoted by the privacy policy, the consent
 * and the recommendation rules (152-FZ wants the operator named in them).
 * The Russian values are msg() keys: pages show them with t(…).
 */
export const OPERATOR_NAME = msg("Акиншин Максим Владиславович");
export const OPERATOR_EMAIL = "peaostrel@bk.ru";
/** Country of the server that holds the database; update it after a move. */
export const SERVER_COUNTRY = msg("США");

/**
 * Edition of the /consent text. Keep it equal to PD_CONSENT_VERSION in
 * app/routers/auth.py: each account records the edition it agreed to.
 */
export const PD_CONSENT_VERSION = "2026-10-19";
export const LEGAL_UPDATED = msg("20 октября 2026");

/** Age category of the site (436-FZ): user texts and explicit lyrics. */
export const AGE_RATING = "16+";
