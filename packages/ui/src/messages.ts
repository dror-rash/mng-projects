import type { Locale, Messages } from "@repo/i18n";

import en from "../messages/en.json";
import he from "../messages/he.json";

/**
 * Shared components' messages (ADR-0011). Each zone puts them under `ui` in its own catalogue, so
 * `getTranslations("ui.languageSwitch")` finds them. The language switch's name keeps the English word in
 * Hebrew, so someone who doesn't read the page's language still finds the switch.
 */
export const uiMessages: Record<Locale, Messages> = { en, he };
