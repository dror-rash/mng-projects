// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/features/forms/form-state";

import { MoveToNextStage } from "./move-to-next-stage";

const texts = { label: "Move to Ordered", moveAnyway: "Move anyway", cancel: "Cancel" };
const props = { projectId: "p1", stage: "ordered", projectHref: "/projects/p1", ...texts };

const question: FormState = {
  error: "2 items are still open in this stage. Move anyway?",
  field: "confirm",
  values: { stage: "ordered" },
};

afterEach(cleanup);

describe("MoveToNextStage", () => {
  it("posts the project and the next stage as a move to the next stage", async () => {
    const action = vi.fn(async (_prev: FormState, _data: FormData): Promise<FormState> => ({}));
    render(<MoveToNextStage {...props} action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Move to Ordered" }));
    expect(Object.fromEntries(action.mock.calls[0]![1])).toEqual({ projectId: "p1", stage: "ordered", from: "next" });
  });

  it("asks first when the server says items are open, and Move anyway posts the confirmation", async () => {
    const action = vi.fn(async (_prev: FormState, _data: FormData): Promise<FormState> => question);
    render(<MoveToNextStage {...props} action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Move to Ordered" }));
    expect(await screen.findByText("2 items are still open in this stage. Move anyway?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to Ordered" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move anyway" }));
    expect(Object.fromEntries(action.mock.calls[1]![1])).toEqual({
      projectId: "p1",
      stage: "ordered",
      from: "next",
      confirm: "yes",
    });
  });

  it("Cancel drops the question and keeps the stage, a link back to the project without JavaScript", async () => {
    const action = vi.fn(async (): Promise<FormState> => question);
    render(<MoveToNextStage {...props} action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Move to Ordered" }));
    const cancel = await screen.findByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/projects/p1");
    await userEvent.click(cancel);
    expect(screen.queryByText(/Move anyway\?/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Ordered" })).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
