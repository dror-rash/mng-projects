import { catalogueDifferences } from "@repo/i18n/catalogue";
import { describe, expect, it } from "vitest";

import { uiMessages } from "./messages";

describe("packages/ui catalogue", () => {
  it("has the same keys and placeholders in Hebrew and English", () => {
    expect(catalogueDifferences(uiMessages.en, uiMessages.he)).toEqual([]);
  });

  it("keeps the English word in the language switch's Hebrew name, so anyone finds the switch", () => {
    expect(uiMessages.he).toHaveProperty("languageSwitch.label", expect.stringContaining("Language"));
  });
});
