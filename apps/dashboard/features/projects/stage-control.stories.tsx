import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { StageControl } from "./stage-control";

const options = [
  { value: "inquiry", label: "Inquiry" },
  { value: "quote", label: "Quote" },
  { value: "ordered", label: "Ordered" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_work", label: "In work" },
  { value: "reporting", label: "Reporting" },
  { value: "billing", label: "Billing" },
  { value: "closed", label: "Closed" },
];

const meta = {
  title: "Dashboard/StageControl",
  component: StageControl,
  parameters: { layout: "padded" },
  args: {
    projectId: "p1",
    stage: "quote",
    options,
    line: (
      <>
        <span className="font-medium">Quote</span> since
      </>
    ),
    since: "2026-11-10",
    sinceText: "Nov 10, 2026",
  },
} satisfies Meta<typeof StageControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Auditors, workers and other viewers: the stage and since when, no form. */
export const ReadOnly: Story = {};

/** Admins, and a partner's users on their partner's projects: the Stage select and "Change stage". */
export const CanChange: Story = { args: { action: async () => ({}) } };

/** A tampered value: the error shows under Stage. */
export const MadeUpStage: Story = {
  args: { action: async () => ({ error: "Choose a stage", field: "stage", values: { stage: "made_up" } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Change stage" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Choose a stage");
  },
};
