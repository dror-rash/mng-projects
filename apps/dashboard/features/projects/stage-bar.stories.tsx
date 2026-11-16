import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { StageBar } from "./stage-bar";

const phases = [
  { phase: "sales", label: "Sales", stages: [{ value: "inquiry", label: "Inquiry" }, { value: "quote", label: "Quote" }, { value: "ordered", label: "Ordered" }] },
  { phase: "work", label: "Work", stages: [{ value: "scheduled", label: "Scheduled" }, { value: "in_work", label: "In work" }] },
  { phase: "closing", label: "Closing", stages: [{ value: "reporting", label: "Reporting" }, { value: "billing", label: "Billing" }, { value: "closed", label: "Closed" }] },
];

const hebrew = [
  { phase: "sales", label: "מכירה", stages: [{ value: "inquiry", label: "פנייה" }, { value: "quote", label: "הצעת מחיר" }, { value: "ordered", label: "הוזמן" }] },
  { phase: "work", label: "ביצוע", stages: [{ value: "scheduled", label: "מתואם" }, { value: "in_work", label: "בביצוע" }] },
  { phase: "closing", label: "סגירה", stages: [{ value: "reporting", label: "דוחות" }, { value: "billing", label: "חיוב" }, { value: "closed", label: "סגור" }] },
];

const meta = {
  title: "Dashboard/StageBar",
  component: StageBar,
  parameters: { layout: "padded" },
  argTypes: {
    stage: { control: "select", options: phases.flatMap((p) => p.stages.map((s) => s.value)) },
  },
  args: {
    projectId: "p1",
    stage: "scheduled",
    phases,
    label: "Stages",
    doneLabel: "done",
    action: async () => ({}),
  },
} satisfies Meta<typeof StageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Whoever can change the project: every stage but the current one is a button, forward or back. */
export const CanChange: Story = {
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole("group", { name: "Stages" });
    await expect(within(bar).getAllByRole("button")).toHaveLength(7);
    await expect(bar.querySelector('[aria-current="step"]')).toHaveTextContent("Scheduled");
  },
};

/** A new project: nothing done yet. (Pick any stage in the `stage` control to see it current.) */
export const AtInquiry: Story = { args: { stage: "inquiry" } };

export const AtQuote: Story = { args: { stage: "quote" } };

export const AtOrdered: Story = { args: { stage: "ordered" } };

export const AtInWork: Story = { args: { stage: "in_work" } };

export const AtReporting: Story = { args: { stage: "reporting" } };

export const AtBilling: Story = { args: { stage: "billing" } };

/** The last stage: everything before it done. */
export const AtClosed: Story = { args: { stage: "closed" } };

/** Auditors, workers, and partners on other projects: the same bar, no buttons. */
export const ReadOnly: Story = {
  args: { action: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole("button")).toHaveLength(0);
  },
};

/** A tampered stage: "Choose a stage" above the bar. */
export const MadeUpStage: Story = {
  args: { action: async () => ({ error: "Choose a stage", field: "stage", values: { stage: "Made up" } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Closed" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Choose a stage");
  },
};

/** Hebrew, right to left. */
export const Hebrew: Story = {
  args: { phases: hebrew, label: "שלבים", doneLabel: "בוצע" },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he">
        <Story />
      </div>
    ),
  ],
};

/** A 360 px phone: the bar scrolls inside itself, the current stage scrolled into view. */
export const Phone: Story = {
  args: { stage: "billing" },
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
  args: { stage: "billing", phases: hebrew, label: "שלבים", doneLabel: "בוצע" },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he" style={{ width: 360 }} className="border">
        <Story />
      </div>
    ),
  ],
};
