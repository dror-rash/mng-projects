import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

/**
 * Every design token in `theme.css` with its role (task 118), so the palette can be reviewed in one place.
 * Swatches carry no text; names and roles sit on the canvas, so the a11y addon checks real text pairs only.
 */
const GROUPS: { title: string; tokens: { name: string; role: string }[] }[] = [
  {
    title: "Surfaces (60%)",
    tokens: [
      { name: "background", role: "The canvas behind every page (paper)" },
      { name: "card", role: "Cards, a lighter tint of the paper" },
      { name: "muted", role: "Hover rows and empty bars" },
      { name: "secondary", role: "Secondary buttons and badges" },
      { name: "border", role: "Borders and dividers" },
    ],
  },
  {
    title: "Text and frame (30%)",
    tokens: [
      { name: "foreground", role: "Headings, body text and links (underlined)" },
      { name: "card-foreground", role: "Text on cards" },
      { name: "muted-foreground", role: "Hints and secondary text" },
      { name: "secondary-foreground", role: "Text on secondary fills" },
    ],
  },
  {
    title: "Accent (10%)",
    tokens: [
      { name: "primary", role: "Fills that carry text: primary buttons, the current menu item" },
      { name: "primary-foreground", role: "Text on those fills" },
      { name: "accent", role: "Non-text marks only: the W mark (never text, 3.4:1)" },
      { name: "ring", role: "Focus marks" },
      { name: "destructive", role: "Errors and Overdue" },
    ],
  },
  {
    title: "Side menu",
    tokens: [
      { name: "sidebar", role: "The side menu and the phone top bar" },
      { name: "sidebar-foreground", role: "Menu labels" },
      { name: "sidebar-muted", role: "Menu hints (email, role)" },
      { name: "sidebar-border", role: "Lines inside the menu" },
      { name: "sidebar-accent", role: "The current menu item" },
      { name: "sidebar-accent-foreground", role: "Text on the current menu item" },
      { name: "sidebar-ring", role: "Focus marks inside the menu" },
    ],
  },
  {
    title: "Charts",
    tokens: [
      { name: "chart-1", role: "To do; the meter fill" },
      { name: "chart-2", role: "Orange (not used for a status: too close to the accent)" },
      { name: "chart-3", role: "Done" },
      { name: "chart-4", role: "In progress" },
      { name: "chart-5", role: "Fifth slot" },
      { name: "chart-track", role: "Behind the meter fill" },
    ],
  },
];

function Palette() {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-base font-semibold">{group.title}</h2>
          <ul className="space-y-2">
            {group.tokens.map((token) => (
              <li key={token.name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-10 shrink-0 rounded-md border"
                  style={{ background: `var(--${token.name})` }}
                />
                <span className="text-sm">
                  <code className="font-medium">--{token.name}</code>
                  <span className="block text-muted-foreground">{token.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function onTheme(dark: boolean): Decorator {
  return function Themed(Story) {
    React.useEffect(() => {
      document.documentElement.classList.toggle("dark", dark);
      return () => document.documentElement.classList.remove("dark");
    }, []);
    return (
      <div className="bg-background p-6 text-foreground">
        <Story />
      </div>
    );
  };
}

const meta = {
  title: "Foundations/Palette",
  component: Palette,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Palette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = { decorators: [onTheme(false)] };
export const Dark: Story = { decorators: [onTheme(true)] };
