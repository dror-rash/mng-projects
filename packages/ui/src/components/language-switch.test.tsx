import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageSwitch } from "./language-switch";

function clearLocaleCookie() {
  document.cookie = "locale=; path=/; max-age=0";
}

describe("LanguageSwitch", () => {
  afterEach(clearLocaleCookie);

  it("is a radio group with each language named in itself", () => {
    render(<LanguageSwitch locale="en" label="Language" reload={vi.fn()} />);

    const group = screen.getByRole("radiogroup", { name: "Language" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute("lang", "en");
    expect(screen.getByRole("radio", { name: "עברית" })).toHaveAttribute("lang", "he");
  });

  it("checks the current language", () => {
    render(<LanguageSwitch locale="he" label="Language" reload={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "עברית" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "English" })).not.toBeChecked();
  });

  it("stores the chosen language in a site-wide cookie and reloads the page", async () => {
    const reload = vi.fn();
    render(<LanguageSwitch locale="en" label="Language" reload={reload} />);

    await userEvent.click(screen.getByRole("radio", { name: "עברית" }));

    expect(document.cookie).toContain("locale=he");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing when the current language is chosen again", async () => {
    const reload = vi.fn();
    render(<LanguageSwitch locale="en" label="Language" reload={reload} />);

    await userEvent.click(screen.getByRole("radio", { name: "English" }));

    expect(document.cookie).not.toContain("locale=");
    expect(reload).not.toHaveBeenCalled();
  });
});
