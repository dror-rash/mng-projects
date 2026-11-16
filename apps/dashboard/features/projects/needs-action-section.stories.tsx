import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { type NeedsActionItem, type NeedsActionList, NeedsActionSection } from "./needs-action-section";

const item = (id: string, name: string, overrides: Partial<NeedsActionItem> = {}): NeedsActionItem => ({
  id,
  name,
  organizationId: "acme",
  customerName: "Acme Ltd",
  stageLabel: "Quote",
  daysText: "10 days",
  badge: null,
  ...overrides,
});

const groups = (ours: NeedsActionItem[], theirs: NeedsActionItem[], more = false): NeedsActionList[] => [
  { group: "our_move", label: "Our move", items: ours, more },
  { group: "waiting_for_customer", label: "Waiting for customer", items: theirs, more: false },
];

const ours = [
  item("p1", "Panel upgrade", { daysText: "21 days" }),
  item("p2", "Gate motor", { customerName: "Globex", stageLabel: "Ordered", daysText: "12 days", badge: { move: "ready", label: "Ready for next stage" } }),
  item("p3", "Warehouse lights", { stageLabel: "In work", daysText: "8 days" }),
];

const theirs = [
  item("p4", "Shelf lighting", { daysText: "9 days" }),
  item("p5", "Parking sensors", { customerName: "Globex", stageLabel: "Billing", daysText: "30 days" }),
];

const text = { heading: "Needs action", empty: "Nothing needs action.", viewAll: "View all on the board" };

const meta = {
  title: "Dashboard/NeedsActionSection",
  component: NeedsActionSection,
  parameters: { layout: "padded" },
  args: { groups: groups(ours, theirs), text },
} satisfies Meta<typeof NeedsActionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both groups, longest wait first; Ready for next stage says so under Our move. */
export const BothGroups: Story = {
  play: async ({ canvasElement }) => {
    const section = within(within(canvasElement).getByRole("region", { name: "Needs action" }));
    await expect(within(section.getByRole("region", { name: "Our move" })).getAllByRole("listitem")).toHaveLength(3);
    await expect(section.getByRole("region", { name: "Waiting for customer" })).toHaveTextContent("Shelf lighting");
  },
};

/** Only our move: the empty group isn't shown. */
export const OneGroup: Story = {
  args: { groups: groups(ours, []) },
};

/** Nothing waited more than 7 days. */
export const Empty: Story = {
  args: { groups: groups([], []) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("region", { name: "Needs action" })).toHaveTextContent("Nothing needs action.");
  },
};

/** More than 10 waiting on us: the first 10, then a link to the board. */
export const MoreThanTen: Story = {
  args: {
    groups: groups(
      Array.from({ length: 10 }, (_, i) => item(`m${i}`, `Project ${i + 1}`, { daysText: `${40 - i} days` })),
      theirs,
      true,
    ),
  },
  play: async ({ canvasElement }) => {
    const ourMove = within(within(canvasElement).getByRole("region", { name: "Our move" }));
    await expect(ourMove.getAllByRole("listitem")).toHaveLength(10);
    await expect(ourMove.getByRole("link", { name: "View all on the board" })).toHaveAttribute("href", "/projects?view=board");
  },
};

/** A partner's users: the customer's name as text, no customer link. */
export const PartnerUser: Story = {
  args: { linkCustomers: false },
};

/** Hebrew, right to left. */
export const Hebrew: Story = {
  args: {
    groups: [
      {
        group: "our_move",
        label: "תורנו",
        more: true,
        items: [
          item("p1", "שדרוג לוח", { customerName: "אקמה בע״מ", stageLabel: "הצעת מחיר", daysText: "21 ימים" }),
          item("p2", "מנוע שער", {
            customerName: "גלובקס",
            stageLabel: "הוזמן",
            daysText: "12 ימים",
            badge: { move: "ready", label: "מוכן לשלב הבא" },
          }),
        ],
      },
      {
        group: "waiting_for_customer",
        label: "ממתין ללקוח",
        more: false,
        items: [item("p4", "תאורת מדפים", { customerName: "אקמה בע״מ", stageLabel: "הצעת מחיר", daysText: "9 ימים" })],
      },
    ],
    text: { heading: "צריך טיפול", empty: "אין כרגע מה לטפל.", viewAll: "הצג הכול בלוח" },
  },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he">
        <Story />
      </div>
    ),
  ],
};
