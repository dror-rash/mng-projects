// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { navFor } from "./nav";
import { SidebarNav } from "./sidebar-nav";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

afterEach(cleanup);

const LABELS = { overview: "Overview", allProjects: "All projects", customers: "Customers" } as const;
const items = navFor("admin").map((item) => ({ ...item, label: LABELS[item.labelKey] }));

function renderAt(pathname: string) {
  navigation.pathname = pathname;
  render(<SidebarNav items={items} />);
}

describe("SidebarNav", () => {
  it("is the Dashboard navigation with a link per item", () => {
    renderAt("/");

    const nav = screen.getByRole("navigation", { name: "Dashboard" });
    expect(nav).toContainElement(screen.getByRole("link", { name: "Overview" }));
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Overview", "All projects", "Customers"]);
  });

  it("marks only the current page's item", () => {
    renderAt("/projects/p1/tasks/t1");

    expect(screen.getByRole("link", { name: "All projects" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Customers" })).not.toHaveAttribute("aria-current");
  });

  it("marks nothing on a page outside the menu", () => {
    renderAt("/my-tasks");

    for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
  });
});
