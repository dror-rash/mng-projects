import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import he from "../../messages/he.json";

import { openProjectTab, parseProjectTab, PROJECT_TABS, projectTabPath, tabForStage } from "./project-tabs";

describe("PROJECT_TABS", () => {
  it("lists the five tabs in the flow's order", () => {
    expect(PROJECT_TABS.map((t) => t.tab)).toEqual(["overview", "sales", "work", "reports", "billing"]);
  });

  it("has a label for every tab in English and Hebrew", () => {
    expect(PROJECT_TABS.map((t) => en.projectTabs[t.labelKey])).toEqual(["Overview", "Sales", "Work", "Reports", "Billing"]);
    expect(PROJECT_TABS.map((t) => he.projectTabs[t.labelKey])).toEqual(["סקירה", "מכירה", "ביצוע", "דוחות", "חיוב"]);
  });
});

describe("parseProjectTab", () => {
  it("takes a tab of the list", () => {
    for (const { tab } of PROJECT_TABS) expect(parseProjectTab(tab)).toBe(tab);
  });

  it("returns null for anything else", () => {
    for (const value of [undefined, null, "", "made-up", "Work", " work", ["work"], 3]) {
      expect(parseProjectTab(value)).toBeNull();
    }
  });
});

describe("tabForStage", () => {
  it("opens each stage on its tab", () => {
    expect(
      Object.fromEntries(
        ["inquiry", "quote", "ordered", "scheduled", "in_work", "reporting", "billing", "closed"].map((s) => [s, tabForStage(s)]),
      ),
    ).toEqual({
      inquiry: "overview",
      quote: "sales",
      ordered: "sales",
      scheduled: "work",
      in_work: "work",
      reporting: "reports",
      billing: "billing",
      closed: "reports",
    });
  });

  it("opens an unknown stored stage like Inquiry", () => {
    expect(tabForStage("made_up")).toBe("overview");
  });
});

describe("openProjectTab", () => {
  it("opens the tab in the address", () => {
    expect(openProjectTab("reports", "in_work")).toBe("reports");
  });

  it("opens the stage's tab without one, or with an unknown one", () => {
    expect(openProjectTab(undefined, "in_work")).toBe("work");
    expect(openProjectTab("made-up", "in_work")).toBe("work");
    expect(openProjectTab(["reports", "work"], "billing")).toBe("billing");
  });
});

describe("projectTabPath", () => {
  it("is the project page at the tab's address", () => {
    expect(projectTabPath("p1", "work")).toBe("/projects/p1?tab=work");
  });

  it("is the bare project page without a tab, so it opens on the stage's tab", () => {
    expect(projectTabPath("p1", null)).toBe("/projects/p1");
  });
});
