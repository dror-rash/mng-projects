import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { navFor } from "./nav";
import { SidebarMenu } from "./sidebar-menu";

const LABELS = { overview: "Overview", allProjects: "All projects", customers: "Customers" } as const;
const items = (role: Parameters<typeof navFor>[0]) => navFor(role).map((item) => ({ ...item, label: LABELS[item.labelKey] }));

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
      <div className="min-h-[560px] bg-background text-foreground">
        <Story />
        <main className="p-6 lg:ps-65">
          <h1 className="text-2xl font-bold">Project Dashboard</h1>
        </main>
      </div>
    );
  };
}

/**
 * The dashboard's side menu (task 119). From 1024px it is the fixed column; narrower, the top bar with the
 * menu button. Storybook has no address, so no item is marked current here (see Components/Sidebar).
 */
const meta = {
  title: "Dashboard/SidebarMenu",
  component: SidebarMenu,
  parameters: { layout: "fullscreen" },
  args: {
    email: "ada@example.com",
    name: "Ada Lovelace",
    role: "admin",
    workspaceName: "Acme Solar",
    items: items("admin"),
    theme: "light",
    locale: "en",
    labels: { language: "Language", openMenu: "Open menu", closeMenu: "Close menu" },
  },
  decorators: [onPage()],
} satisfies Meta<typeof SidebarMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Admin: Story = {};

/** Partners and workers don't see Customers (`navFor`). */
export const Partner: Story = { args: { role: "partner", items: items("partner") } };

/** A record from another workspace: the switcher names it and says so. */
export const InAnotherWorkspace: Story = { args: { workspaceName: "Northwind Energy", otherWorkspace: true } };

/** No name: the avatar takes the email's first letter. */
export const WithoutName: Story = { args: { name: null } };

export const Dark: Story = { args: { theme: "dark" }, parameters: page({ dark: true }) };

export const RightToLeft: Story = {
  args: { locale: "he", items: items("admin").map((item) => ({ ...item, label: { overview: "סקירה", allProjects: "כל הפרויקטים", customers: "לקוחות" }[item.labelKey] })) },
  parameters: page({ dir: "rtl" }),
};
