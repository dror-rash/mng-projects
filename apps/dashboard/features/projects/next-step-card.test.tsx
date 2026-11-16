// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NextStepCard, type NextStepItem } from "./next-step-card";

const items: NextStepItem[] = [
  { key: "quote.costed", label: "Materials and labour costed", party: "Us", done: true, tickedBy: "Dana Admin", tickedOn: "2026-11-10", tickedOnText: "November 10, 2026" },
  { key: "quote.sent", label: "Quote sent to the customer", party: "Us", done: false, tickedBy: null, tickedOn: null, tickedOnText: null },
  { key: "quote.accepted", label: "Customer accepted the quote", party: "Customer", done: false, tickedBy: null, tickedOn: null, tickedOnText: null },
];

const props = {
  projectId: "p1",
  heading: "Next step",
  stageLine: <p>Quote since today</p>,
  move: "our_move" as const,
  moveLabel: "Our move",
  progress: "1 of 3 done",
  doneLabel: "Done",
  openLabel: "Not done",
  items,
};

afterEach(cleanup);

const region = () => screen.getByRole("region", { name: "Next step" });

describe("NextStepCard", () => {
  it("is a region named by its heading, with the stage line, the badge and the progress", () => {
    render(<NextStepCard {...props} />);
    expect(within(region()).getByText("Quote since today")).toBeInTheDocument();
    expect(within(region()).getByText("Our move")).toBeInTheDocument();
    expect(within(region()).getByText("1 of 3 done")).toBeInTheDocument();
  });

  it("colors the badge from its chart slot", () => {
    render(<NextStepCard {...props} />);
    expect(within(region()).getByText("Our move")).toHaveClass("border-chart-4", "bg-chart-4/15");
    cleanup();
    render(<NextStepCard {...props} move="waiting_for_customer" moveLabel="Waiting for customer" />);
    expect(within(region()).getByText("Waiting for customer")).toHaveClass("border-chart-1", "bg-chart-1/15");
    cleanup();
    render(<NextStepCard {...props} move="complete" moveLabel="Job complete" />);
    expect(within(region()).getByText("Job complete")).toHaveClass("border-chart-3", "bg-chart-3/15");
  });

  it("lists the items in order, each starting with its text, with its party", () => {
    render(<NextStepCard {...props} />);
    const listItems = within(region()).getAllByRole("listitem");
    expect(listItems.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Materials and labour costed.*Us/),
      expect.stringMatching(/^Quote sent to the customer.*Us/),
      expect.stringMatching(/^Customer accepted the quote.*Customer/),
    ]);
  });

  it("shows who ticked a done item and the day, as a calendar date", () => {
    render(<NextStepCard {...props} />);
    const [done, open] = within(region()).getAllByRole("listitem");
    expect(done).toHaveTextContent("Dana Admin, November 10, 2026");
    expect(within(done!).getByText("November 10, 2026")).toHaveAttribute("datetime", "2026-11-10");
    expect(open!.querySelector("time")).toBeNull();
  });

  it("shows the day alone when the user who ticked it is deleted", () => {
    render(<NextStepCard {...props} items={[{ ...items[0]!, tickedBy: null }]} />);
    const [done] = within(region()).getAllByRole("listitem");
    expect(within(done!).getByText("November 10, 2026").parentElement).toHaveTextContent(/^November 10, 2026$/);
  });

  it("has no buttons without an action, and marks done and open items", () => {
    render(<NextStepCard {...props} />);
    expect(within(region()).queryAllByRole("button")).toEqual([]);
    expect(within(region()).getAllByRole("img").map((img) => img.getAttribute("aria-label"))).toEqual(["Done", "Not done", "Not done"]);
  });

  it("gives whoever can change the project a pressed or unpressed button per item, posting the other state", () => {
    render(<NextStepCard {...props} toggleAction={async () => {}} />);
    const buttons = within(region()).getAllByRole("button");
    expect(buttons.map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Materials and labour costed", "true"],
      ["Quote sent to the customer", "false"],
      ["Customer accepted the quote", "false"],
    ]);
    const form = (button: HTMLElement) => Object.fromEntries(new FormData(button.closest("form")!));
    expect(form(buttons[0]!)).toEqual({ projectId: "p1", item: "quote.costed", done: "false" });
    expect(form(buttons[1]!)).toEqual({ projectId: "p1", item: "quote.sent", done: "true" });
  });

  const moveTo = { stage: "ordered", label: "Move to Ordered", moveAnyway: "Move anyway", cancel: "Cancel" };

  it("gives whoever can change the project a button to the next stage", () => {
    render(<NextStepCard {...props} moveTo={moveTo} moveAction={async () => ({})} />);
    const button = within(region()).getByRole("button", { name: "Move to Ordered" });
    expect(Object.fromEntries(new FormData(button.closest("form")!))).toEqual({ projectId: "p1", stage: "ordered", from: "next" });
  });

  it("has no button to the next stage without the action, or at Closed", () => {
    render(<NextStepCard {...props} moveTo={moveTo} />);
    expect(within(region()).queryByRole("button", { name: /^Move to/ })).not.toBeInTheDocument();
    cleanup();
    render(<NextStepCard {...props} moveAction={async () => ({})} />);
    expect(within(region()).queryByRole("button", { name: /^Move to/ })).not.toBeInTheDocument();
  });
});
