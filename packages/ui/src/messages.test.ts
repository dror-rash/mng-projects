import { catalogueDifferences } from "@repo/i18n/catalogue";
import { describe, expect, it } from "vitest";

import { uiMessages } from "./messages";

describe("packages/ui catalogue", () => {
  it("has the same keys and placeholders in Hebrew and English", () => {
    expect(catalogueDifferences(uiMessages.en, uiMessages.he)).toEqual([]);
  });

  it("names the language switch so it is found in either language", () => {
    expect(uiMessages.en).toEqual({ languageSwitch: { label: "Language" } });
    expect(uiMessages.he).toEqual({ languageSwitch: { label: "שפה / Language" } });
  });
});
