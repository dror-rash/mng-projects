import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { NextStepCard, type NextStepItem } from "./next-step-card";

const open = { done: false, tickedBy: null, tickedOn: null, tickedOnText: null };
const ticked = (tickedBy: string | null) => ({ done: true, tickedBy, tickedOn: "2026-11-10", tickedOnText: "November 10, 2026" });

const quote = (done: number, tickedBy: string | null = "Dana Admin"): NextStepItem[] =>
  [
    { key: "quote.costed", label: "Materials and labour costed", party: "Us" },
    { key: "quote.sent", label: "Quote sent to the customer", party: "Us" },
    { key: "quote.accepted", label: "Customer accepted the quote", party: "Customer" },
  ].map((item, i) => ({ ...item, ...(i < done ? ticked(tickedBy) : open) }));

const stageLine = (stage: string, since = "since") => (
  <p className="text-sm">
    <span className="font-medium">{stage}</span> {since} <time dateTime="2026-11-10">November 10, 2026</time>
  </p>
);

const meta = {
  title: "Dashboard/NextStepCard",
  component: NextStepCard,
  parameters: { layout: "padded" },
  args: {
    projectId: "p1",
    heading: "Next step",
    stageLine: stageLine("Quote"),
    move: "our_move",
    moveLabel: "Our move",
    progress: "0 of 3 done",
    doneLabel: "Done",
    openLabel: "Not done",
    items: quote(0),
    toggleAction: async () => {},
  },
} satisfies Meta<typeof NextStepCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing done yet: our move (amber). Whoever can change the project gets a button per item. */
export const OurMove: Story = {
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole("region", { name: "Next step" });
    await expect(within(card).getAllByRole("button", { pressed: false })).toHaveLength(3);
  },
};

/** Our items done, the customer's open: waiting for the customer (blue). */
export const WaitingForCustomer: Story = {
  args: { move: "waiting_for_customer", moveLabel: "Waiting for customer", progress: "2 of 3 done", items: quote(2) },
};

/** Every item done: ready for the next stage (green). */
export const ReadyForNextStage: Story = {
  args: { move: "ready", moveLabel: "Ready for next stage", progress: "3 of 3 done", items: quote(3) },
};

/** At Closed with its item done: the job is complete (green). */
export const JobComplete: Story = {
  args: {
    stageLine: stageLine("Closed"),
    move: "complete",
    moveLabel: "Job complete",
    progress: "1 of 1 done",
    items: [{ key: "closed.completion_report", label: "Work-completion report prepared and sent", party: "Us", ...ticked("Dana Admin") }],
  },
};

/** Auditors, workers, and partners on other projects: the same list, no buttons. */
export const ReadOnly: Story = {
  args: { move: "waiting_for_customer", moveLabel: "Waiting for customer", progress: "2 of 3 done", items: quote(2), toggleAction: undefined },
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole("region", { name: "Next step" });
    await expect(within(card).queryAllByRole("button")).toHaveLength(0);
  },
};

/** The user who ticked an item has deleted their account: the day alone. */
export const DeletedTicker: Story = {
  args: { progress: "1 of 3 done", items: quote(1, null) },
};

/** Hebrew, right to left (the owner's texts). */
export const Hebrew: Story = {
  args: {
    heading: "הצעד הבא",
    stageLine: stageLine("הצעת מחיר", "מאז"),
    move: "waiting_for_customer",
    moveLabel: "ממתין ללקוח",
    progress: "2 מתוך 3 בוצעו",
    doneLabel: "בוצע",
    openLabel: "לא בוצע",
    items: [
      { key: "quote.costed", label: "תמחיר חומרים וכוח אדם", party: "אנחנו", ...ticked("דנה") },
      { key: "quote.sent", label: "ההצעה נשלחה ללקוח", party: "אנחנו", ...ticked("דנה") },
      { key: "quote.accepted", label: "הלקוח אישר את ההצעה", party: "לקוח", ...open },
    ],
  },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he">
        <Story />
      </div>
    ),
  ],
};
