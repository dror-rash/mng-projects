import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Badge } from "./badge";
import { Button } from "./button";
import { FieldError } from "./field-error";
import { Meter } from "./meter";
import { StackedBar } from "./stacked-bar";
import { ThemeToggle } from "./theme-toggle";

/**
 * Renders the story on the given theme's surface, so the a11y addon checks contrast in that theme.
 * Choosing a theme in the story also writes the theme cookie on Storybook's origin; harmless.
 */
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
  title: "Components/ThemeToggle",
  component: ThemeToggle,
  args: { theme: "system" },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = { args: { theme: "light" }, decorators: [onTheme(false)] };
export const Dark: Story = { args: { theme: "dark" }, decorators: [onTheme(true)] };
export const System: Story = { args: { theme: "system" } };

/** The shared tokens on a theme's surface: text, buttons, errors, badges and the chart tokens. */
function Tokens(args: React.ComponentProps<typeof ThemeToggle>) {
  return (
    <div className="flex max-w-md flex-col gap-4">
      <ThemeToggle {...args} />
      <p>
        Foreground text and <span className="text-muted-foreground">muted text</span>.
      </p>
      <div className="flex gap-2">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Delete</Button>
      </div>
      <FieldError message="Name is required" />
      <div className="flex gap-2">
        <Badge>Default</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
      <Meter label="Progress" value={60} />
      <StackedBar
        label="Tasks by status"
        segments={[
          { label: "To do", value: 3, slot: 1 },
          { label: "In progress", value: 2, slot: 4 },
          { label: "Done", value: 5, slot: 3 },
        ]}
      />
    </div>
  );
}

export const LightTokens: Story = { args: { theme: "light" }, decorators: [onTheme(false)], render: Tokens };
export const DarkTokens: Story = { args: { theme: "dark" }, decorators: [onTheme(true)], render: Tokens };
