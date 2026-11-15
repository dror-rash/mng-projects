import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, screen, userEvent, within } from "storybook/test";

import { Building2Icon, ChevronsUpDownIcon, FolderKanbanIcon, LayoutDashboardIcon } from "../icons";
import { Button } from "./button";
import { Sidebar, SidebarInset, SidebarLink, SidebarPanel, SidebarTopBar } from "./sidebar";
import { SidebarDrawer } from "./sidebar-drawer";

/** Sets the page's direction and theme on <html>, where the drawer's portal reads them too. */
type PageOptions = { dir?: "ltr" | "rtl"; dark?: boolean };

/** Story parameters for the page: `parameters: page({ dark: true })`. */
const page = (options: PageOptions) => ({ page: options });

function onPage(): Decorator {
  return function Page(Story, { parameters }) {
    const { dir = "ltr", dark = false } = (parameters.page ?? {}) as PageOptions;
    React.useEffect(() => {
      document.documentElement.dir = dir;
      document.documentElement.classList.toggle("dark", dark);
      return () => {
        document.documentElement.dir = "ltr";
        document.documentElement.classList.remove("dark");
      };
    }, [dir, dark]);
    return (
      <div className="bg-background text-foreground">
        <Story />
      </div>
    );
  };
}

function Nav({ current = "Overview" }: { current?: string }) {
  const items = [
    { label: "Overview", icon: <LayoutDashboardIcon /> },
    { label: "All projects", icon: <FolderKanbanIcon /> },
    { label: "Customers", icon: <Building2Icon /> },
  ];
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-1">
      {items.map((item) => (
        <SidebarLink key={item.label} href="#" icon={item.icon} current={item.label === current}>
          {item.label}
        </SidebarLink>
      ))}
    </nav>
  );
}

function Panel({ otherWorkspace = false }: { otherWorkspace?: boolean }) {
  return (
    <SidebarPanel
      top={
        <a href="#" aria-label="Acme Solar: switch workspace" className="flex items-center gap-2 rounded-md p-1 hover:bg-sidebar-border">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-accent font-bold text-sidebar-accent-foreground">
            W
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">Acme Solar</span>
            {otherWorkspace && <span className="text-xs text-sidebar-muted">in another workspace</span>}
            <span className="text-xs text-sidebar-muted">Admin</span>
          </span>
          <ChevronsUpDownIcon aria-hidden="true" className="size-4 text-sidebar-muted" />
        </a>
      }
      bottom={
        <div className="flex flex-col gap-3">
          <span className="truncate text-sm text-sidebar-muted">ada@example.com</span>
          <Button variant="outline">Log out</Button>
        </div>
      }
    >
      <Nav />
    </SidebarPanel>
  );
}

/** The desktop frame: the column (shown here at any width) and the page beside it. */
function Frame({ otherWorkspace }: { otherWorkspace?: boolean }) {
  return (
    <div className="relative h-[560px] overflow-hidden">
      <Sidebar className="absolute flex">
        <Panel otherWorkspace={otherWorkspace} />
      </Sidebar>
      <SidebarInset className="ps-59">
        <main className="p-6">
          <h1 className="text-2xl font-bold">Project Dashboard</h1>
        </main>
      </SidebarInset>
    </div>
  );
}

const meta = {
  title: "Components/Sidebar",
  component: Sidebar,
  args: { children: null },
  parameters: { layout: "fullscreen" },
  render: () => <Frame />,
  decorators: [onPage()],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Overview is the current page. */
export const Light: Story = {};

export const Dark: Story = { parameters: page({ dark: true }) };

/** In Hebrew the menu is on the right; the logical classes mirror it. */
export const RightToLeft: Story = { parameters: page({ dir: "rtl" }) };

/** On a record from another workspace, the switcher says so. */
export const InAnotherWorkspace: Story = { render: () => <Frame otherWorkspace /> };

/** The links on their own: the current one, and the next one under the pointer. */
export const Links: Story = {
  render: () => (
    <div className="w-59 bg-sidebar p-3 text-sidebar-foreground">
      <Nav current="All projects" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "All projects" })).toHaveAttribute("aria-current", "page");
    await userEvent.hover(canvas.getByRole("link", { name: "Customers" }));
  },
};

/** Keyboard focus on a link shows the menu's focus ring. */
export const LinkFocus: Story = {
  render: Links.render,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("link", { name: "Overview" })).toHaveFocus();
  },
};

function TopBar({ open = false }: { open?: boolean }) {
  return (
    <SidebarTopBar className="lg:flex">
      <SidebarDrawer openLabel="Open menu" closeLabel="Close menu" title="Acme Solar" defaultOpen={open}>
        <Panel />
      </SidebarDrawer>
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-accent font-bold text-sidebar-accent-foreground">
        W
      </span>
      <span className="truncate text-sm font-semibold">Acme Solar</span>
    </SidebarTopBar>
  );
}

/** The phone top bar with the drawer closed. */
export const PhoneClosed: Story = { render: () => <TopBar /> };

/** The phone drawer open, from the start side. */
export const PhoneOpen: Story = { render: () => <TopBar open /> };

export const PhoneOpenDark: Story = { render: () => <TopBar open />, parameters: page({ dark: true }) };

/** In Hebrew the drawer opens from the right. */
export const PhoneOpenRightToLeft: Story = { render: () => <TopBar open />, parameters: page({ dir: "rtl" }) };

/** The menu button opens the drawer and Escape closes it. */
export const PhoneOpensAndCloses: Story = {
  render: () => <TopBar />,
  play: async () => {
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await expect(await screen.findByRole("navigation", { name: "Dashboard" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(screen.queryByRole("navigation", { name: "Dashboard" })).toBeNull();
  },
};
