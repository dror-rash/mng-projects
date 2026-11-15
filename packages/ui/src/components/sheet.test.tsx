import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";

function Example() {
  return (
    <Sheet>
      <SheetTrigger>Open menu</SheetTrigger>
      <SheetContent closeLabel="Close menu">
        <SheetTitle>Menu</SheetTitle>
        <a href="/projects">All projects</a>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("is closed until its trigger is pressed", () => {
    render(<Example />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a dialog named by its title, with a close button", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
  });

  it("closes with Escape and gives focus back to its trigger", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("button", { name: "Close menu" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps focus inside while open", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    for (let i = 0; i < 4; i++) await user.tab();

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });
});
