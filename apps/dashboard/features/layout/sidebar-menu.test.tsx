// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { navFor } from "./nav";
import { SidebarMenu, type SidebarMenuProps } from "./sidebar-menu";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@repo/auth/components", () => ({ SignOutButton: () => <button type="button">Log out</button> }));

afterEach(cleanup);

const props: SidebarMenuProps = {
  email: "ada@example.com",
  name: "Ada Lovelace",
  role: "admin",
  workspaceName: "Acme Solar",
  items: navFor("admin").map((item) => ({ ...item, label: item.labelKey })),
  theme: "light",
  locale: "en",
  labels: { menu: "Menu", language: "Language", openMenu: "Open menu", closeMenu: "Close menu" },
};

const switcher = (name: string) => screen.getByRole("link", { name: `${name}: switch workspace` });

describe("SidebarMenu", () => {
  it("shows my role in the current workspace under its name", () => {
    render(<SidebarMenu {...props} />);

    expect(within(switcher("Acme Solar")).getByText("Admin")).toBeInTheDocument();
  });

  it("hides my role on a record from another workspace, where it isn't my role there", () => {
    render(<SidebarMenu {...props} workspaceName="Northwind" otherWorkspace />);

    const link = switcher("Northwind");
    expect(within(link).getByText("in another workspace")).toBeInTheDocument();
    expect(within(link).queryByText("Admin")).not.toBeInTheDocument();
  });

  it("names the menu landmark", () => {
    render(<SidebarMenu {...props} />);

    expect(screen.getByRole("complementary", { name: "Menu" })).toBeInTheDocument();
  });
});
