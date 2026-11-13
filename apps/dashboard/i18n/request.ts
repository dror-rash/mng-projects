import { createRequestConfig } from "@repo/i18n/server";
import { uiMessages } from "@repo/ui/messages";

import en from "../messages/en.json";
import he from "../messages/he.json";

// next-intl without locale routing (ADR-0011): the language comes from the request, never the URL.
export default createRequestConfig({
  en: { ui: uiMessages.en, ...en },
  he: { ui: uiMessages.he, ...he },
});
