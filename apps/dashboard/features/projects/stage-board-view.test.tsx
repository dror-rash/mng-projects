// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StageBoard, type StageBoardCard, type StageBoardPhase } from "./stage-board-view";

const card = (overrides: Partial<StageBoardCard> = {}): StageBoardCard => ({
  id: "p1",
  name: "Panel upgrade",
  organizationId: "acme",
  customerName: "Acme Ltd",
  move: "our_move",
  moveLabel: "Our move",
  daysText: "12 days",
  longWait: true,
  ...overrides,
});

const phases = (quote: StageBoardCard[]): StageBoardPhase[] => [
  {
    phase: "sales",
    label: "Sales",
    columns: [
      { stage: "inquiry", label: "Inquiry", cards: [] },
      { stage: "quote", label: "Quote", cards: quote },
    ],
  },
  { phase: "work", label: "Work", columns: [{ stage: "in_work", label: "In work", cards: [] }] },
];

const text = { label: "Stage board", empty: "No projects", longWait: "more than 7 days in this stage" };

afterEach(cleanup);

describe("StageBoard", () => {
  it("shows each phase as a heading and each stage as a region named with its count", () => {
    render(<StageBoard phases={phases([card(), card({ id: "p2", name: "Fire alarm" })])} text={text} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Sales", "Work"]);
    expect(screen.getByRole("region", { name: "Quote 2" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Inquiry 0" })).toBeInTheDocument();
  });

  it("says an empty column has no projects", () => {
    render(<StageBoard phases={phases([card()])} text={text} />);
    const inquiry = screen.getByRole("region", { name: "Inquiry 0" });
    expect(inquiry).toHaveTextContent("No projects");
    expect(within(inquiry).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("puts the project link first in a card, then the customer, whose move and the days", () => {
    render(<StageBoard phases={phases([card({ longWait: false, daysText: "3 days" })])} text={text} />);
    const item = within(screen.getByRole("region", { name: "Quote 1" })).getByRole("listitem");
    const links = within(item).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Panel upgrade", "/projects/p1"],
      ["Acme Ltd", "/customers/acme"],
    ]);
    expect(item).toHaveTextContent("Our move");
    expect(item).toHaveTextContent("3 days");
    expect(item).not.toHaveTextContent("more than 7 days in this stage");
  });

  it("says a long wait in words, not only in colour", () => {
    render(<StageBoard phases={phases([card()])} text={text} />);
    const item = within(screen.getByRole("region", { name: "Quote 1" })).getByRole("listitem");
    expect(item).toHaveTextContent("12 days");
    expect(item).toHaveTextContent("more than 7 days in this stage");
  });

  it("shows the customer as text for a partner's users", () => {
    render(<StageBoard phases={phases([card()])} text={text} linkCustomers={false} />);
    const item = within(screen.getByRole("region", { name: "Quote 1" })).getByRole("listitem");
    expect(within(item).getAllByRole("link")).toHaveLength(1);
    expect(item).toHaveTextContent("Acme Ltd");
  });

  it("shows Canceled instead of whose move on a canceled project", () => {
    render(<StageBoard phases={phases([card({ move: null, moveLabel: "Canceled" })])} text={text} />);
    const item = within(screen.getByRole("region", { name: "Quote 1" })).getByRole("listitem");
    expect(item).toHaveTextContent("Canceled");
    expect(item).not.toHaveTextContent("Our move");
  });
});
