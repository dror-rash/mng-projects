import { catalogueDifferences } from "@repo/i18n/catalogue";
import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import he from "../messages/he.json";

describe("shell catalogue", () => {
  it("has the same keys and placeholders in Hebrew and English", () => {
    expect(catalogueDifferences(en, he)).toEqual([]);
  });

  it("welcomes people back on the login page", () => {
    expect(en.login.heading).toBe("Welcome back");
    expect(he.login.heading).toBe("ברוכים השבים");
  });
});
