// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StageSince } from "./stage-since";

const props = { line: (
    <>
      <span>Quote</span> since
    </>
  ), since: "2026-11-10", sinceText: "November 10, 2026" };

afterEach(cleanup);

describe("StageSince", () => {
  it("shows the stage and since when, the day as a calendar date", () => {
    render(<StageSince {...props} />);
    const time = screen.getByText("November 10, 2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-11-10");
    expect(time.parentElement).toHaveTextContent(/^Quote since November 10, 2026$/);
    expect(screen.getByText("Quote", { selector: "span" })).toBeInTheDocument();
  });

  it("has no form: the stage bar moves the project", () => {
    render(<StageSince {...props} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
