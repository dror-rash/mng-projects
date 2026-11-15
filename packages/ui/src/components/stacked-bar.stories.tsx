import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent } from "storybook/test";

import { StackedBar } from "./stacked-bar";

const meta = {
  title: "Components/StackedBar",
  component: StackedBar,
  args: {
    label: "Tasks by status",
    segments: [
      { label: "To do", value: 5, slot: 1 },
      { label: "In progress", value: 3, slot: 4 },
      { label: "Done", value: 8, slot: 3 },
    ],
  },
  decorators: [(Story) => <div className="w-96 pt-10"><Story /></div>],
} satisfies Meta<typeof StackedBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Task statuses name their slots: To do blue, In progress amber, Done green (task 118). */
export const Mixed: Story = {};

/** Segments without a slot take the slots in fixed order (chart-1 … chart-5). */
export const FixedOrder: Story = {
  args: {
    label: "Five slots",
    segments: ["A", "B", "C", "D", "E"].map((label) => ({ label, value: 1 })),
  },
};

/** Tab reaches the segments in order; the focused one shows label, count and share. */
export const SegmentFocused: Story = {
  play: async () => {
    await userEvent.tab();
    await userEvent.tab();
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("In progress: 3 (19%)");
  },
};

export const SegmentHovered: Story = {
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByRole("img", { name: "Done: 8 (50%)" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("Done: 8 (50%)");
  },
};
export const SingleStatus: Story = {
  args: {
    segments: [
      { label: "To do", value: 0, slot: 1 },
      { label: "In progress", value: 0, slot: 4 },
      { label: "Done", value: 4, slot: 3 },
    ],
  },
};
export const Empty: Story = {
  args: {
    segments: [
      { label: "To do", value: 0, slot: 1 },
      { label: "In progress", value: 0, slot: 4 },
      { label: "Done", value: 0, slot: 3 },
    ],
    emptyText: "No tasks yet",
  },
};
