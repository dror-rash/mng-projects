import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { WhoseMoveBadge } from "./whose-move-badge";

const meta = {
  title: "Dashboard/WhoseMoveBadge",
  component: WhoseMoveBadge,
  parameters: { layout: "padded" },
  args: { move: "our_move", label: "Our move" },
} satisfies Meta<typeof WhoseMoveBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An open item of ours decides: amber. */
export const OurMove: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Our move")).toBeVisible();
  },
};

/** The first open item is the customer's: blue. */
export const WaitingForCustomer: Story = {
  args: { move: "waiting_for_customer", label: "Waiting for customer" },
};

/** Everything at the stage done: green. */
export const ReadyForNextStage: Story = {
  args: { move: "ready", label: "Ready for next stage" },
};

/** At Closed with its item done: green. */
export const JobComplete: Story = {
  args: { move: "complete", label: "Job complete" },
};
