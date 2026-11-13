import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { LanguageSwitch } from "./language-switch";

/** Choosing a language here writes the locale cookie on Storybook's origin and calls `reload` (a spy). */
const meta = {
  title: "Components/LanguageSwitch",
  component: LanguageSwitch,
  args: { locale: "en", label: "Language", reload: fn() },
} satisfies Meta<typeof LanguageSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnglishChosen: Story = {};

export const HebrewChosen: Story = { args: { locale: "he", label: "שפה / Language" } };

/** In a Hebrew page: right to left, so English sits at the end. */
export const RightToLeft: Story = {
  args: { locale: "he", label: "שפה / Language" },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he" className="flex justify-start gap-2">
        <Story />
      </div>
    ),
  ],
};
