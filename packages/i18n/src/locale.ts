/**
 * The app's languages (ADR-0011). The choice is the `locale` cookie on path=/, shared by every zone (one
 * origin, through the shell's rewrites), like the theme cookie. Not httpOnly: the switch writes it in the
 * browser, and it holds nothing sensitive. A cookie value only reaches `lang`, `dir` or a catalogue
 * through `parseLocale`, so a made-up value can't inject anything.
 */
export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Each language's name in itself, so anyone finds theirs whatever the page's language. */
const NAMES: Record<Locale, string> = { en: "English", he: "עברית" };
const DIRS: Record<Locale, "ltr" | "rtl"> = { en: "ltr", he: "rtl" };

export function parseLocale(value: string | undefined | null): Locale {
  return LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;
}

export function localeName(locale: Locale): string {
  return NAMES[locale];
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return DIRS[locale];
}

export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

/**
 * The browser's preference: Hebrew if it ranks above English in `Accept-Language` (by weight, then by
 * order), otherwise English. Other languages don't count; `q=0` means "not this one".
 */
export function localeFromAcceptLanguage(header: string | undefined | null): Locale {
  const ranked = (header ?? "")
    .split(",")
    .map((entry, index) => {
      const [range = "", ...params] = entry.trim().split(";");
      const weight = params.map((param) => /^\s*q=([01](?:\.\d{0,3})?)\s*$/.exec(param)?.[1]).find(Boolean);
      return { language: range.trim().toLowerCase().split("-")[0], q: weight === undefined ? 1 : Number(weight), index };
    })
    .filter((entry) => entry.q > 0 && (entry.language === "he" || entry.language === "en"))
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked[0]?.language === "he" ? "he" : DEFAULT_LOCALE;
}

/** The request's language: the cookie if it names one we have, then the browser, then English. */
export function localeFromRequest(cookie: string | undefined | null, acceptLanguage: string | undefined | null): Locale {
  const chosen = LOCALES.find((locale) => locale === cookie);
  return chosen ?? localeFromAcceptLanguage(acceptLanguage);
}
