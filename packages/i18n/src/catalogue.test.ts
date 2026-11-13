import { describe, expect, it } from "vitest";

import { catalogueDifferences } from "./catalogue";

describe("catalogueDifferences", () => {
  it("finds nothing when both languages have the same keys and placeholders", () => {
    const en = { nav: { overview: "Overview", greeting: "Hello {name}" } };
    const he = { nav: { overview: "סקירה", greeting: "שלום {name}" } };

    expect(catalogueDifferences(en, he)).toEqual([]);
  });

  it("names a key missing from either language", () => {
    const en = { nav: { overview: "Overview", projects: "All projects" } };
    const he = { nav: { overview: "סקירה" }, extra: "עוד" };

    expect(catalogueDifferences(en, he)).toEqual(["he is missing nav.projects", "en is missing extra"]);
  });

  it("names a key that is text in one language and a group in the other", () => {
    expect(catalogueDifferences({ nav: "Menu" }, { nav: { overview: "סקירה" } })).toEqual([
      "nav is text in en but a group in he",
    ]);
  });

  it("names a message whose placeholders differ", () => {
    const en = { greeting: "Hello {name}", count: "{count, plural, one {# task} other {# tasks}}" };
    const he = { greeting: "שלום {first}", count: "{count, plural, one {משימה אחת} other {# משימות}}" };

    expect(catalogueDifferences(en, he)).toEqual(["greeting has placeholders name in en but first in he"]);
  });

  it("doesn't take plural branch text for a placeholder", () => {
    const en = { count: "{count, plural, one {task} other {tasks}}" };
    const he = { count: "{count, plural, one {משימה} other {משימות}}" };

    expect(catalogueDifferences(en, he)).toEqual([]);
  });

  it("doesn't take select branch text for a placeholder", () => {
    const en = { role: "{kind, select, admin {Admin} other {Other}}" };
    const he = { role: "{kind, select, admin {מנהל} other {אחר}}" };

    expect(catalogueDifferences(en, he)).toEqual([]);
  });

  it("names a select argument missing from one language", () => {
    const en = { role: "{kind, select, admin {Admin {name}} other {Other}}" };
    const he = { role: "{kind, select, admin {מנהל} other {אחר}}" };

    expect(catalogueDifferences(en, he)).toEqual(["role has placeholders kind, name in en but kind in he"]);
  });

  it("ignores quoted braces, which are text", () => {
    expect(catalogueDifferences({ a: "Use '{name}' literally" }, { a: "טקסט" })).toEqual([]);
  });

  it("counts placeholders nested in plural branches", () => {
    const en = { line: "{count, plural, one {# task for {who}} other {# tasks for {who}}}" };
    const he = { line: "{count, plural, one {משימה אחת} other {# משימות}}" };

    expect(catalogueDifferences(en, he)).toEqual(["line has placeholders count, who in en but count in he"]);
  });
});
