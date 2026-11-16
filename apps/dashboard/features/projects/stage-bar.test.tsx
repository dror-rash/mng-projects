// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/features/forms/form-state";

import { StageBar } from "./stage-bar";

const phases = [
  { phase: "sales", label: "Sales", stages: [{ value: "inquiry", label: "Inquiry" }, { value: "quote", label: "Quote" }, { value: "ordered", label: "Ordered" }] },
  { phase: "work", label: "Work", stages: [{ value: "scheduled", label: "Scheduled" }, { value: "in_work", label: "In work" }] },
  { phase: "closing", label: "Closing", stages: [{ value: "reporting", label: "Reporting" }, { value: "billing", label: "Billing" }, { value: "closed", label: "Closed" }] },
];

const props = { projectId: "p1", stage: "scheduled", phases, label: "Stages", doneLabel: "done" };

/** The bar's stages: the innermost list items. */
const stages = () =>
  within(screen.getByRole("group", { name: "Stages" }))
    .getAllByRole("listitem")
    .filter((item) => within(item).queryAllByRole("listitem").length === 0);

// jsdom lays nothing out: the bar is 300 px wide, its current stage 100 px wide at `currentLeft`, and setting
// the bar's scrollLeft is recorded. The page itself must never scroll (no scrollIntoView).
let currentLeft = 50;
const scrolledTo = vi.fn();
const scrollIntoView = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
beforeEach(() => {
  currentLeft = 50;
  scrolledTo.mockReset();
  scrollIntoView.mockReset();
  vi.spyOn(Element.prototype, "scrollLeft", "set").mockImplementation(function (this: Element, value: number) {
    scrolledTo(this, value);
  });
  vi.spyOn(Element.prototype, "scrollLeft", "get").mockReturnValue(0);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 20, height: 20, x: left, y: 0 }) as DOMRect;
    if (this.getAttribute("aria-current") === "step") return box(currentLeft, 100);
    return box(0, 300);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StageBar", () => {
  it("shows the eight stages under their phases", () => {
    render(<StageBar {...props} />);
    const bar = screen.getByRole("group", { name: "Stages" });
    expect(within(bar).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Sales", "Work", "Closing"]);
    expect(within(bar).getAllByRole("heading")).toHaveLength(3);
    // The phases sit under a heading of their own, "Stages", outside the group (the page's sections are h2-h3).
    expect(screen.getByRole("heading", { level: 2, name: "Stages" })).toBeInTheDocument();
    expect(stages().map((s) => s.textContent)).toEqual([
      "Inquiry, done",
      "Quote, done",
      "Ordered, done",
      "Scheduled",
      "In work",
      "Reporting",
      "Billing",
      "Closed",
    ]);
  });

  it("marks the current stage as the current step", () => {
    render(<StageBar {...props} />);
    const current = screen.getByRole("group", { name: "Stages" }).querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(/^Scheduled$/);
  });

  it("leaves the bar where it is when the current stage is in view", () => {
    render(<StageBar {...props} />);
    expect(scrolledTo).not.toHaveBeenCalled();
  });

  it("scrolls only the bar, centring a current stage that is out of view, either way", () => {
    currentLeft = 500;
    render(<StageBar {...props} />);
    const bar = screen.getByRole("group", { name: "Stages" });
    // 500 - 0 - (300 - 100) / 2 = 400 further along.
    expect(scrolledTo).toHaveBeenLastCalledWith(bar, 400);
    cleanup();
    currentLeft = -400;
    render(
      <div dir="rtl">
        <StageBar {...props} />
      </div>,
    );
    expect(scrolledTo).toHaveBeenLastCalledWith(screen.getByRole("group", { name: "Stages" }), -500);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("can be scrolled with the keyboard by someone who has no buttons on it", () => {
    render(<StageBar {...props} />);
    expect(screen.getByRole("group", { name: "Stages" })).toHaveAttribute("tabindex", "0");
    cleanup();
    render(<StageBar {...props} action={async () => ({})} />);
    expect(screen.getByRole("group", { name: "Stages" })).not.toHaveAttribute("tabindex");
  });

  it("has no buttons for someone who can't change the project", () => {
    render(<StageBar {...props} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("makes every other stage a button that posts the project and that stage", async () => {
    const action = vi.fn(async (_prev: FormState, _data: FormData): Promise<FormState> => ({}));
    render(<StageBar {...props} action={action} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Inquiry, done",
      "Quote, done",
      "Ordered, done",
      "In work",
      "Reporting",
      "Billing",
      "Closed",
    ]);
    expect(screen.getByRole("button", { name: /^Quote\W+done$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "In work" }));
    expect(Object.fromEntries(action.mock.calls[0]![1])).toEqual({ projectId: "p1", stage: "in_work" });
  });

  it("shows a refused stage's error above the bar", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: "Choose a stage", field: "stage", values: { stage: "Made up" } }));
    render(<StageBar {...props} action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Closed" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Choose a stage");
    expect(alert.compareDocumentPosition(screen.getByRole("group", { name: "Stages" }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("counts an unknown stored stage as Inquiry", () => {
    render(<StageBar {...props} stage="made_up" />);
    expect(stages()[0]).toHaveAttribute("aria-current", "step");
  });
});
