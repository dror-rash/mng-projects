import { describe, expect, it } from "vitest";

import { loginUrl, safeNext } from "./redirect";

const BASE = "https://app.invalid";

/** Seeded PRNG (mulberry32) so a failing generated case reproduces. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  "/", "//", "\\", ":", ".", "..", "@", "%", "%2f", "%5c", "%09", "%0a", "%2e", "?", "#",
  "a", "b", "evil.example", "localhost", "http", "https:", "javascript:", " ", "\t", "\n", "\r",
  "\u0000", "\u001f", "\u007f", " ", "　", "﻿",
];

function generate(random: () => number): string {
  const length = Math.floor(random() * 10);
  let value = random() < 0.7 ? "/" : "";
  for (let i = 0; i < length; i++) value += PIECES[Math.floor(random() * PIECES.length)];
  return value;
}

function originOf(path: string): string {
  try {
    return new URL(path, BASE).origin;
  } catch {
    return "invalid URL";
  }
}

function isClean(value: string): boolean {
  return [...value].every((char) => {
    const code = char.charCodeAt(0);
    return code > 0x1f && code !== 0x7f && char !== "\\";
  });
}

describe("safeNext", () => {
  it("keeps same-origin paths, including other zones", () => {
    expect(safeNext("/example/account?tab=1")).toBe("/example/account?tab=1");
  });

  it("keeps the path, query and hash of a same-origin path", () => {
    expect(safeNext("/dashboard/projects/x?tab=1#top")).toBe("/dashboard/projects/x?tab=1#top");
  });

  it.each([undefined, null, "", "https://evil.example", "//evil.example", "/\\evil.example", "example/account"])(
    "falls back to / for %s",
    (value) => {
      expect(safeNext(value)).toBe("/");
    },
  );

  it.each([
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "\t//evil.example",
    "/\t\\evil.example",
    "/x\n",
    "/dashboard\r\n",
    "/\u0000",
    "/\u007f",
    "\\/evil.example",
    "\\\\evil.example",
    "/dashboard\\x",
    "/x/\\/evil.example",
    "/.//evil.example",
    "/./\\evil.example",
    "/..//evil.example",
    "/a/..//evil.example",
    decodeURIComponent("/%09/evil.example"),
    decodeURIComponent("/%0d%0a/evil.example"),
    decodeURIComponent("/%5cevil.example"),
    decodeURIComponent("/%5c%5cevil.example"),
  ])("falls back for %j", (value) => {
    expect(safeNext(value, "/fallback")).toBe("/fallback");
  });

  it.each(["/%09/evil.example", "/%5cevil.example", "/%2f%2fevil.example", "/%2e%2e//evil.example"])(
    "stays on the site for the percent-encoded %j",
    (value) => {
      expect(originOf(safeNext(value))).toBe(BASE);
    },
  );

  it("supports a custom fallback", () => {
    expect(safeNext("https://evil.example", "/home")).toBe("/home");
  });

  it("stays on the origin it is resolved against, for generated inputs", () => {
    const random = seeded(79);
    for (let i = 0; i < 5000; i++) {
      const input = generate(random);
      expect({ input, origin: originOf(safeNext(input)) }).toEqual({ input, origin: BASE });
    }
  });

  it("never returns control characters or backslashes, for generated inputs", () => {
    const random = seeded(80);
    for (let i = 0; i < 5000; i++) {
      const input = generate(random);
      expect({ input, clean: isClean(safeNext(input)) }).toEqual({ input, clean: true });
    }
  });
});

describe("loginUrl", () => {
  it("encodes the page the visitor wanted", () => {
    expect(loginUrl("/example/account?tab=1")).toBe("/login?next=%2Fexample%2Faccount%3Ftab%3D1");
  });
});
