import { describe, expect, it } from "vitest";

import { describePage, redactUrl } from "./failure-diagnostics";

describe("redactUrl", () => {
  it("keeps the path and query of a page, without the origin", () => {
    expect(redactUrl("https://pr-1---shell.example.app/dashboard/sites/new?customer=abc")).toBe("/dashboard/sites/new?customer=abc");
  });

  it("hides the token of an invite link", () => {
    expect(redactUrl("https://shell.example.app/dashboard/invite/s3cr3t-token?x=1")).toBe("/dashboard/invite/[redacted]?x=1");
  });

  it("hides query values that can be secrets", () => {
    expect(redactUrl("https://shell.example.app/reset-password?token=abc&callbackURL=%2Fdashboard")).toBe(
      "/reset-password?token=%5Bredacted%5D&callbackURL=%2Fdashboard",
    );
  });

  it("hides an invite token inside a query value, like the login page's return path", () => {
    expect(redactUrl("https://shell.example.app/login?next=%2Fdashboard%2Finvite%2Fs3cr3t-token")).toBe(
      "/login?next=%2Fdashboard%2Finvite%2F%5Bredacted%5D",
    );
  });

  it("returns something readable for a URL it can't parse", () => {
    expect(redactUrl("about:blank")).toBe("about:blank");
  });
});

describe("describePage", () => {
  it("lists the URL, the visible headings and the error texts, one per line", () => {
    expect(describePage({ url: "https://a.app/sites/1", headings: ["404", "This page could not be found."], errors: [] })).toBe(
      "URL: /sites/1\nHeadings: 404 | This page could not be found.\nErrors: none",
    );
  });

  it("collapses whitespace and shortens long texts, so the summary fits the reporter's 300 characters", () => {
    const text = describePage({ url: "https://a.app/x", headings: ["  New site\n for  Acme  "], errors: ["e".repeat(200)] });
    expect(text).toContain("Headings: New site for Acme\n");
    expect(text).toContain(`Errors: ${"e".repeat(79)}…`);
  });

  it("says when the page shows no heading", () => {
    expect(describePage({ url: "https://a.app/x", headings: [], errors: ["Site name is required"] })).toBe(
      "URL: /x\nHeadings: none\nErrors: Site name is required",
    );
  });
});
