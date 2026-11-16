// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectTabs } from "./project-tabs-nav";

const tabs = [
  { tab: "overview", label: "Overview" },
  { tab: "sales", label: "Sales" },
  { tab: "work", label: "Work" },
  { tab: "reports", label: "Reports" },
  { tab: "billing", label: "Billing" },
] as const;

afterEach(cleanup);

const nav = () => screen.getByRole("navigation", { name: "Project sections" });

describe("ProjectTabs", () => {
  it("links every tab to its own address, in order, under the list's name", () => {
    render(<ProjectTabs projectId="p1" open="overview" tabs={[...tabs]} label="Project sections" />);
    const links = within(nav()).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Overview", "Sales", "Work", "Reports", "Billing"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/projects/p1?tab=overview",
      "/projects/p1?tab=sales",
      "/projects/p1?tab=work",
      "/projects/p1?tab=reports",
      "/projects/p1?tab=billing",
    ]);
  });

  it("marks the open tab, and only it, as the current page", () => {
    render(<ProjectTabs projectId="p1" open="work" tabs={[...tabs]} label="Project sections" />);
    expect(within(nav()).getByRole("link", { name: "Work" })).toHaveAttribute("aria-current", "page");
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("names the list in the page's language", () => {
    render(<ProjectTabs projectId="p1" open="billing" tabs={[{ tab: "billing", label: "חיוב" }]} label="חלקי הפרויקט" />);
    expect(screen.getByRole("navigation", { name: "חלקי הפרויקט" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "חיוב" })).toHaveAttribute("aria-current", "page");
  });
});
