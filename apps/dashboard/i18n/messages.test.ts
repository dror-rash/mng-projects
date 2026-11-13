import { catalogueDifferences } from "@repo/i18n/catalogue";
import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import he from "../messages/he.json";
import { navFor } from "@/features/layout/nav";

describe("dashboard catalogue", () => {
  it("has the same keys and placeholders in Hebrew and English", () => {
    expect(catalogueDifferences(en, he)).toEqual([]);
  });

  it("has a label for every menu link", () => {
    for (const item of navFor("admin")) {
      expect(en.nav).toHaveProperty(item.labelKey);
    }
  });
});
