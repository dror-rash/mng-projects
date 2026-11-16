import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { ProjectTabs } from "./project-tabs-nav";

const english = [
  { tab: "overview", label: "Overview" },
  { tab: "sales", label: "Sales" },
  { tab: "work", label: "Work" },
  { tab: "reports", label: "Reports" },
  { tab: "billing", label: "Billing" },
] as const;

const hebrew = [
  { tab: "overview", label: "סקירה" },
  { tab: "sales", label: "מכירה" },
  { tab: "work", label: "ביצוע" },
  { tab: "reports", label: "דוחות" },
  { tab: "billing", label: "חיוב" },
] as const;

const meta = {
  title: "Dashboard/ProjectTabs",
  component: ProjectTabs,
  parameters: { layout: "padded" },
  argTypes: {
    open: { control: "select", options: english.map((t) => t.tab) },
  },
  args: {
    projectId: "p1",
    open: "overview",
    tabs: [...english],
    label: "Project sections",
  },
} satisfies Meta<typeof ProjectTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A project at Inquiry: Overview open. */
export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole("navigation", { name: "Project sections" });
    await expect(within(nav).getAllByRole("link")).toHaveLength(5);
    await expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  },
};

/** Quote or Ordered. */
export const Sales: Story = { args: { open: "sales" } };

/** Scheduled or In work, and where a worker lands. */
export const Work: Story = { args: { open: "work" } };

/** Reporting or Closed. */
export const Reports: Story = { args: { open: "reports" } };

export const Billing: Story = { args: { open: "billing" } };

/** Hebrew, right to left. */
export const Hebrew: Story = {
  args: { tabs: [...hebrew], label: "חלקי הפרויקט", open: "work" },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he">
        <Story />
      </div>
    ),
  ],
};

/** A 360 px phone: the row fits, or scrolls inside itself, never the page. */
export const Phone: Story = {
  args: { open: "billing" },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }} className="border">
        <Story />
      </div>
    ),
  ],
};

/** A phone in Hebrew. */
export const PhoneHebrew: Story = {
  args: { tabs: [...hebrew], label: "חלקי הפרויקט", open: "billing" },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he" style={{ width: 360 }} className="border">
        <Story />
      </div>
    ),
  ],
};
