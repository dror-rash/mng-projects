import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, screen, userEvent } from "storybook/test";

import { Button } from "./button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./sheet";

/** Sets the page's direction and theme on <html>, where the sheet's portal reads them. */
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
      <div className="min-h-64 bg-background p-6 text-foreground">
        <Story />
      </div>
    );
  };
}

const meta = {
  title: "Components/Sheet",
  component: Sheet,
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger asChild>
        <Button variant="outline">Open panel</Button>
      </SheetTrigger>
      <SheetContent closeLabel="Close panel">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Opens from the start side: the left in English, the right in Hebrew.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
  decorators: [onPage()],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = { args: { defaultOpen: true } };

export const OpenDark: Story = { args: { defaultOpen: true }, parameters: page({ dark: true }) };

/** In a right-to-left page the sheet opens from the right. */
export const OpenRightToLeft: Story = { args: { defaultOpen: true }, parameters: page({ dir: "rtl" }) };

/** Escape closes the sheet and focus goes back to the button that opened it. */
export const ClosesWithEscape: Story = {
  play: async () => {
    const trigger = screen.getByRole("button", { name: "Open panel" });
    await userEvent.click(trigger);
    await expect(await screen.findByRole("dialog", { name: "Filters" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(screen.queryByRole("dialog")).toBeNull();
    await expect(trigger).toHaveFocus();
  },
};
