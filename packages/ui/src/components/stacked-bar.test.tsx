import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { StackedBar } from "./stacked-bar";

const segments = [
  { label: "To do", value: 2 },
  { label: "In progress", value: 1 },
  { label: "Done", value: 1 },
];

describe("StackedBar", () => {
  it("is a figure named by its label", () => {
    render(<StackedBar label="Tasks by status" segments={segments} />);
    expect(screen.getByRole("figure", { name: "Tasks by status" })).toBeInTheDocument();
  });

  it("lists every segment with its value in the legend", () => {
    render(<StackedBar label="Tasks by status" segments={segments} />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["To do2", "In progress1", "Done1"]);
  });

  it("sizes each segment by its share of the total", () => {
    const { container } = render(<StackedBar label="Tasks by status" segments={segments} />);

    const widths = [...container.querySelectorAll<HTMLElement>("[data-segment]")].map((el) => el.style.flexGrow);
    expect(widths).toEqual(["2", "1", "1"]);
  });

  it("shows an empty message when every value is zero", () => {
    render(<StackedBar label="Tasks by status" segments={[{ label: "To do", value: 0 }]} emptyText="No tasks yet" />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });

  it("gives up to five segments their own color", () => {
    const five = ["A", "B", "C", "D", "E"].map((label) => ({ label, value: 1 }));
    const { container } = render(<StackedBar label="Five" segments={five} />);

    const colors = [...container.querySelectorAll<HTMLElement>("[data-segment]")].map((el) =>
      [...el.classList].find((c) => c.startsWith("bg-chart-")),
    );
    expect(colors).toEqual(["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"]);
  });

  it("colors a segment with the chart slot it names, in the bar and the legend", () => {
    const named = [
      { label: "To do", value: 2, slot: 1 },
      { label: "In progress", value: 1, slot: 4 },
      { label: "Done", value: 1, slot: 3 },
    ] as const;
    const { container } = render(<StackedBar label="Tasks by status" segments={[...named]} />);

    const slot = (el: Element) => [...el.classList].find((c) => c.startsWith("bg-chart-"));
    expect([...container.querySelectorAll("[data-segment]")].map(slot)).toEqual(["bg-chart-1", "bg-chart-4", "bg-chart-3"]);
    expect([...container.querySelectorAll("li > span[aria-hidden]")].map(slot)).toEqual([
      "bg-chart-1",
      "bg-chart-4",
      "bg-chart-3",
    ]);
  });

  it("shows the label, count and share of a segment when it is focused", async () => {
    const user = userEvent.setup();
    const tasks = [
      { label: "To do", value: 5 },
      { label: "In progress", value: 4 },
      { label: "Done", value: 1 },
    ];
    render(<StackedBar label="Tasks by status" segments={tasks} />);

    await user.tab();
    await user.tab();

    expect(screen.getByRole("img", { name: "In progress: 4 (40%)" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("In progress: 4 (40%)");
  });

  it("lets the keyboard reach the segments in order, skipping empty ones", async () => {
    const user = userEvent.setup();
    render(<StackedBar label="Tasks by status" segments={[...segments, { label: "Blocked", value: 0 }]} />);

    const focused: string[] = [];
    for (let i = 0; i < 4; i++) {
      await user.tab();
      focused.push(document.activeElement?.getAttribute("aria-label") ?? "(none)");
    }
    expect(focused).toEqual(["To do: 2 (50%)", "In progress: 1 (25%)", "Done: 1 (25%)", "(none)"]);
  });

  it("shows the tooltip on hover", async () => {
    const user = userEvent.setup();
    render(<StackedBar label="Tasks by status" segments={segments} />);

    await user.hover(screen.getByRole("img", { name: "Done: 1 (25%)" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Done: 1 (25%)");
  });

  it("shows the tooltip on tap", async () => {
    const user = userEvent.setup();
    render(<StackedBar label="Tasks by status" segments={segments} />);

    await user.pointer({ keys: "[TouchA]", target: screen.getByRole("img", { name: "To do: 2 (50%)" }) });

    expect(await screen.findByRole("tooltip")).toHaveTextContent("To do: 2 (50%)");
  });
});
