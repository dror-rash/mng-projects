// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

// jsdom lays nothing out, so it has no scrollIntoView; the bar scrolls its current stage into view.
const scrolled = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrolled;
});
afterEach(cleanup);

describe("StageBar", () => {
  it("shows the eight stages under their phases", () => {
    render(<StageBar {...props} />);
    const bar = screen.getByRole("group", { name: "Stages" });
    expect(within(bar).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Sales", "Work", "Closing"]);
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
    expect(scrolled.mock.contexts.at(-1)).toBe(current[0]);
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
