import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";

import { StageBoard, type StageBoardCard, type StageBoardPhase } from "./stage-board-view";

const card = (id: string, name: string, overrides: Partial<StageBoardCard> = {}): StageBoardCard => ({
  id,
  name,
  organizationId: "acme",
  customerName: "Acme Ltd",
  move: "our_move",
  moveLabel: "Our move",
  daysText: "3 days",
  longWait: false,
  ...overrides,
});

type Columns = Record<string, StageBoardCard[]>;

const STAGES: [phase: string, label: string, stages: [stage: string, label: string][]][] = [
  ["sales", "Sales", [["inquiry", "Inquiry"], ["quote", "Quote"], ["ordered", "Ordered"]]],
  ["work", "Work", [["scheduled", "Scheduled"], ["in_work", "In work"]]],
  ["closing", "Closing", [["reporting", "Reporting"], ["billing", "Billing"], ["closed", "Closed"]]],
];

const board = (columns: Columns, labels = STAGES): StageBoardPhase[] =>
  labels.map(([phase, label, stages]) => ({
    phase,
    label,
    columns: stages.map(([stage, stageLabel]) => ({ stage, label: stageLabel, cards: columns[stage] ?? [] })),
  }));

const full: Columns = {
  inquiry: [card("p1", "Office rewiring", { daysText: "1 day" })],
  quote: [
    card("p2", "Panel upgrade", { daysText: "12 days", longWait: true }),
    card("p3", "Fire alarm", { move: "waiting_for_customer", moveLabel: "Waiting for customer" }),
  ],
  scheduled: [card("p4", "Shelf lighting", { customerName: "Globex", move: "ready", moveLabel: "Ready for next stage", daysText: "5 days" })],
  in_work: [card("p5", "Warehouse lights", { daysText: "2 days" })],
  billing: [card("p6", "Parking sensors", { move: "waiting_for_customer", moveLabel: "Waiting for customer", daysText: "9 days", longWait: true })],
  closed: [card("p7", "Lobby sockets", { move: "complete", moveLabel: "Job complete", daysText: "30 days", longWait: true })],
};

const text = { label: "Stage board", empty: "No projects", longWait: "more than 7 days in this stage" };

const meta = {
  title: "Dashboard/StageBoard",
  component: StageBoard,
  parameters: { layout: "padded" },
  args: { phases: board(full), text },
} satisfies Meta<typeof StageBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Projects at most stages: each column named with its count, the longest wait first. */
export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Sales", "Work", "Closing"]);
    await expect(within(canvas.getByRole("region", { name: "Quote 2" })).getAllByRole("listitem")).toHaveLength(2);
  },
};

/** A filter left one stage: every other column says "No projects". */
export const EmptyColumns: Story = {
  args: { phases: board({ quote: full.quote! }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("region", { name: "Inquiry 0" })).toHaveTextContent("No projects");
  },
};

/** More than 7 days at a stage: red with a clock, and said in words to screen readers. */
export const LongWaits: Story = {
  args: {
    phases: board({
      quote: [
        card("p2", "Panel upgrade", { daysText: "45 days", longWait: true }),
        card("p8", "Gate motor", { daysText: "8 days", longWait: true }),
        card("p3", "Fire alarm", { daysText: "7 days" }),
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const cards = within(within(canvasElement).getByRole("region", { name: "Quote 3" })).getAllByRole("listitem");
    await expect(cards[1]).toHaveTextContent("more than 7 days in this stage");
    await expect(cards[2]).not.toHaveTextContent("more than 7 days in this stage");
  },
};

/** A canceled project keeps its stage and shows "Canceled" instead of whose move. */
export const Canceled: Story = {
  args: { phases: board({ ordered: [card("p9", "Roof panels", { move: null, moveLabel: "Canceled", daysText: "20 days", longWait: true })] }) },
};

/** A partner's users: the customer's name as text, no customer link. */
export const PartnerUser: Story = {
  args: { linkCustomers: false },
};

const he: typeof STAGES = [
  ["sales", "מכירה", [["inquiry", "פנייה"], ["quote", "הצעת מחיר"], ["ordered", "הוזמן"]]],
  ["work", "ביצוע", [["scheduled", "מתואם"], ["in_work", "בביצוע"]]],
  ["closing", "סגירה", [["reporting", "דוחות"], ["billing", "חיוב"], ["closed", "סגור"]]],
];

/** Hebrew, right to left: the columns run from the right. */
export const Hebrew: Story = {
  args: {
    phases: board(
      {
        quote: [
          card("p2", "שדרוג לוח", { customerName: "אקמה בע״מ", daysText: "12 ימים", longWait: true, moveLabel: "תורנו" }),
          card("p3", "גלאי אש", { customerName: "אקמה בע״מ", daysText: "יומיים", move: "waiting_for_customer", moveLabel: "ממתין ללקוח" }),
        ],
      },
      he,
    ),
    text: { label: "לוח שלבים", empty: "אין פרויקטים", longWait: "יותר מ־7 ימים בשלב הזה" },
  },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he">
        <Story />
      </div>
    ),
  ],
};

const phone = (dir: "ltr" | "rtl") => (Story: () => ReactNode) => (
  <div dir={dir} style={{ width: 360, maxWidth: "100%" }}>
    <Story />
  </div>
);

/**
 * The columns overflow the board, which scrolls; the 360 px wrapper around it doesn't. Every element in the board
 * is placed within it: an absolutely positioned one (the long wait's screen-reader text) whose containing block is
 * outside the scroller isn't clipped and widens the page (QA, task 123).
 */
const staysInsideTheBoard: Story["play"] = async ({ canvasElement }) => {
  const board = within(canvasElement).getByRole("region", { name: /Stage board|לוח שלבים/ });
  const wrapper = board.parentElement!;
  await expect(board.scrollWidth).toBeGreaterThan(board.clientWidth);
  await expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth);
  const escaping = [...board.querySelectorAll<HTMLElement>("*")].filter(
    (el) => getComputedStyle(el).position === "absolute" && !board.contains(el.offsetParent),
  );
  await expect(escaping).toHaveLength(0);
};

/** A 360 px phone, long waits included: the columns scroll inside the board, the page doesn't. */
export const Phone: Story = {
  decorators: [phone("ltr")],
  play: staysInsideTheBoard,
};

/** The same phone in Hebrew, right to left. */
export const PhoneHebrew: Story = {
  args: Hebrew.args,
  decorators: [
    (Story) => (
      <div lang="he">
        <Story />
      </div>
    ),
    phone("rtl"),
  ],
  play: staysInsideTheBoard,
};
