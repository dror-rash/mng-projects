import { afterEach, describe, expect, it, vi } from "vitest";

// Next's request APIs are the boundary here: the test gives the request's cookies and headers.
const request = vi.hoisted(() => ({ cookie: undefined as string | undefined, acceptLanguage: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "locale" && request.cookie !== undefined ? { value: request.cookie } : undefined) }),
  headers: async () => ({ get: (name: string) => (name.toLowerCase() === "accept-language" ? request.acceptLanguage : null) }),
}));

vi.mock("next-intl/server", () => ({ getRequestConfig: <T>(create: T) => create }));

const { createRequestConfig, requestLocale } = await import("./server");

afterEach(() => {
  request.cookie = undefined;
  request.acceptLanguage = null;
});

describe("requestLocale", () => {
  it("reads the locale cookie", async () => {
    request.cookie = "he";
    request.acceptLanguage = "en-US";

    expect(await requestLocale()).toBe("he");
  });

  it("reads Accept-Language without a cookie", async () => {
    request.acceptLanguage = "he-IL,he;q=0.9";

    expect(await requestLocale()).toBe("he");
  });

  it("falls back to English for an unknown cookie and no header", async () => {
    request.cookie = "xx";

    expect(await requestLocale()).toBe("en");
  });
});

describe("createRequestConfig", () => {
  it("gives next-intl the request's language and its catalogue", async () => {
    request.cookie = "he";
    const config = createRequestConfig({ en: { nav: { overview: "Overview" } }, he: { nav: { overview: "סקירה" } } });

    // getRequestConfig is mocked to return the function it wraps.
    const create = config as unknown as () => Promise<unknown>;
    expect(await create()).toEqual({ locale: "he", messages: { nav: { overview: "סקירה" } } });
  });
});
