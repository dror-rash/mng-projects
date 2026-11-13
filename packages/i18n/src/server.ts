import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import type { Messages } from "./catalogue";
import { type Locale, LOCALE_COOKIE, localeFromRequest } from "./locale";

/** The language of the request being rendered: the `locale` cookie, then `Accept-Language`, then English. */
export async function requestLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return localeFromRequest(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
}

/**
 * A zone's `i18n/request.ts` for next-intl without locale routing (ADR-0011). The catalogues are imported
 * statically and picked by a parsed `Locale`, so a cookie value never becomes a module path.
 */
export function createRequestConfig(catalogues: Record<Locale, Messages>) {
  return getRequestConfig(async () => {
    const locale = await requestLocale();
    return { locale, messages: catalogues[locale] };
  });
}
