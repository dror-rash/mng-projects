import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  localeCookie,
  localeDir,
  localeFromAcceptLanguage,
  localeFromRequest,
  localeName,
  parseLocale,
} from "./locale";

describe("LOCALES", () => {
  it("offers English and Hebrew, English first and by default", () => {
    expect(LOCALES).toEqual(["en", "he"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });
});

describe("parseLocale", () => {
  it("keeps a known language", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("he")).toBe("he");
  });

  it("falls back to English for anything else", () => {
    expect(parseLocale("xx")).toBe("en");
    expect(parseLocale("HE")).toBe("en");
    expect(parseLocale('he" onload="x')).toBe("en");
    expect(parseLocale("")).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
    expect(parseLocale(null)).toBe("en");
  });
});

describe("localeDir", () => {
  it("writes Hebrew right to left and English left to right", () => {
    expect(localeDir("he")).toBe("rtl");
    expect(localeDir("en")).toBe("ltr");
  });
});

describe("localeName", () => {
  it("names each language in itself", () => {
    expect(localeName("en")).toBe("English");
    expect(localeName("he")).toBe("עברית");
  });
});

describe("localeCookie", () => {
  it("stores the choice site-wide for a year", () => {
    expect(LOCALE_COOKIE).toBe("locale");
    expect(localeCookie("he")).toBe("locale=he; path=/; max-age=31536000; samesite=lax");
  });
});

describe("localeFromAcceptLanguage", () => {
  it("picks Hebrew for a Hebrew browser", () => {
    expect(localeFromAcceptLanguage("he-IL")).toBe("he");
    expect(localeFromAcceptLanguage("he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("he");
  });

  it("picks English when English ranks above Hebrew", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,he;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("he;q=0.5,en;q=0.8")).toBe("en");
  });

  it("picks Hebrew when it ranks above English further down the list", () => {
    expect(localeFromAcceptLanguage("fr-FR,he;q=0.9,en;q=0.5")).toBe("he");
    expect(localeFromAcceptLanguage("fr;q=0.5,he;q=0.4")).toBe("he");
  });

  it("keeps the header's order between equal weights", () => {
    expect(localeFromAcceptLanguage("en,he")).toBe("en");
    expect(localeFromAcceptLanguage("he,en")).toBe("he");
  });

  it("ignores a language marked as not acceptable", () => {
    expect(localeFromAcceptLanguage("he;q=0,fr")).toBe("en");
  });

  it("gives English to any other or missing preference", () => {
    expect(localeFromAcceptLanguage("fr-FR")).toBe("en");
    expect(localeFromAcceptLanguage("*")).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage("hebrew,;;q=x")).toBe("en");
  });
});

describe("localeFromRequest", () => {
  it("follows the cookie first", () => {
    expect(localeFromRequest("en", "he-IL")).toBe("en");
    expect(localeFromRequest("he", "en-US")).toBe("he");
  });

  it("follows the browser when there is no cookie", () => {
    expect(localeFromRequest(undefined, "he-IL")).toBe("he");
    expect(localeFromRequest(undefined, "fr-FR")).toBe("en");
  });

  it("ignores a cookie with an unknown language", () => {
    expect(localeFromRequest("xx", "fr-FR")).toBe("en");
    expect(localeFromRequest("xx", "he-IL")).toBe("he");
  });

  it("falls back to English with neither", () => {
    expect(localeFromRequest(undefined, undefined)).toBe("en");
  });
});
