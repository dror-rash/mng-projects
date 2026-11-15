import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Sidebar, SidebarLink, SidebarPanel } from "./sidebar";
import { SidebarDrawer } from "./sidebar-drawer";

describe("SidebarLink", () => {
  it("marks the current page", () => {
    render(
      <nav aria-label="Dashboard">
        <SidebarLink href="/" current>
          Overview
        </SidebarLink>
        <SidebarLink href="/projects">All projects</SidebarLink>
      </nav>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All projects" })).not.toHaveAttribute("aria-current");
  });

  it("keeps its text name when it has an icon", () => {
    render(
      <SidebarLink href="/" icon={<svg data-testid="icon" />}>
        Overview
      </SidebarLink>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByTestId("icon").parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("renders its child link instead of an anchor", () => {
    render(
      <SidebarLink asChild current>
        <a href="/customers">Customers</a>
      </SidebarLink>,
    );

    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("aria-current", "page");
  });
});

describe("SidebarPanel", () => {
  it("puts the top, the nav and the bottom in order", () => {
    render(<SidebarPanel top={<p>Workspace</p>} bottom={<p>Account</p>}>
      <p>Nav</p>
    </SidebarPanel>);

    expect(screen.getAllByText(/Workspace|Nav|Account/).map((el) => el.textContent)).toEqual(["Workspace", "Nav", "Account"]);
  });
});

describe("Sidebar", () => {
  it("is a complementary column holding the panel", () => {
    render(<Sidebar label="Menu"><p>Nav</p></Sidebar>);

    expect(screen.getByRole("complementary", { name: "Menu" })).toHaveTextContent("Nav");
  });
});

describe("SidebarDrawer", () => {
  function Example() {
    return (
      <SidebarDrawer openLabel="Open menu" closeLabel="Close menu" title="Acme">
        <nav aria-label="Dashboard">
          <a href="#projects">All projects</a>
        </nav>
        <button type="button">Log out</button>
      </SidebarDrawer>
    );
  }

  it("opens from the menu button", async () => {
    const user = userEvent.setup();
    render(<Example />);
    expect(screen.queryByRole("navigation", { name: "Dashboard" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("dialog", { name: "Acme" })).toContainElement(screen.getByRole("navigation", { name: "Dashboard" }));
  });

  it("closes when I choose a link inside it", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "All projects" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open when I open a link in a new tab or window", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const link = screen.getByRole("link", { name: "All projects" });
    for (const keys of ["{Control>}", "{Meta>}", "{Shift>}"]) {
      await user.keyboard(keys);
      await user.click(link);
      await user.keyboard("{/Control}{/Meta}{/Shift}");
    }
    await user.pointer({ keys: "[MouseMiddle]", target: link });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stays open when I press a button inside it", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
