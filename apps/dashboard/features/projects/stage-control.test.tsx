// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/features/forms/form-state";

import { StageControl } from "./stage-control";

const options = [
  { value: "inquiry", label: "Inquiry" },
  { value: "quote", label: "Quote" },
  { value: "ordered", label: "Ordered" },
];

const props = { projectId: "p1", stage: "quote", options, line: (
    <>
      <span>Quote</span> since
    </>
  ), since: "2026-11-10", sinceText: "November 10, 2026" };

afterEach(cleanup);

describe("StageControl", () => {
  it("shows the stage and since when, the day as a calendar date", () => {
    render(<StageControl {...props} />);
    const time = screen.getByText("November 10, 2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-11-10");
    expect(time.parentElement).toHaveTextContent(/^Quote since November 10, 2026$/);
    expect(screen.getByText("Quote", { selector: "span" })).toBeInTheDocument();
  });

  it("has no form for someone who can't change the project", () => {
    render(<StageControl {...props} />);
    expect(screen.queryByLabelText("Stage")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change stage" })).not.toBeInTheDocument();
  });

  it("posts the project and the chosen stage, starting from the current one", async () => {
    const action = vi.fn(async (_prev: FormState, _data: FormData): Promise<FormState> => ({}));
    render(<StageControl {...props} action={action} />);
    const select = screen.getByLabelText("Stage");
    expect(select).toHaveValue("quote");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Inquiry", "Quote", "Ordered"]);
    await userEvent.selectOptions(select, "Ordered");
    await userEvent.click(screen.getByRole("button", { name: "Change stage" }));
    const data = action.mock.calls[0]![1];
    expect(Object.fromEntries(data)).toEqual({ projectId: "p1", stage: "ordered" });
  });

  it("starts the select over from the current stage when the refused value isn't a stage", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: "Choose a stage", field: "stage", values: { stage: "made_up" } }));
    render(<StageControl {...props} action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Change stage" }));
    await screen.findByText("Choose a stage");
    expect(screen.getByLabelText("Stage")).toHaveValue("quote");
  });

  it("shows the error on the Stage select", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: "Choose a stage", field: "stage", values: { stage: "made_up" } }));
    render(<StageControl {...props} action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Change stage" }));
    expect(await screen.findByText("Choose a stage")).toBeInTheDocument();
    expect(screen.getByLabelText("Stage")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Stage")).toHaveAccessibleDescription("Choose a stage");
  });
});
