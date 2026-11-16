// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { type NeedsActionItem, type NeedsActionList, NeedsActionSection } from "./needs-action-section";

const item = (overrides: Partial<NeedsActionItem> = {}): NeedsActionItem => ({
  id: "p1",
  name: "Panel upgrade",
  organizationId: "acme",
  customerName: "Acme Ltd",
  stageLabel: "Quote",
  daysText: "10 days",
  badge: null,
  ...overrides,
});

const groups = (ours: NeedsActionItem[], theirs: NeedsActionItem[] = [], more = false): NeedsActionList[] => [
  { group: "our_move", label: "Our move", items: ours, more },
  { group: "waiting_for_customer", label: "Waiting for customer", items: theirs, more: false },
];

const text = { heading: "Needs action", empty: "Nothing needs action.", viewAll: "View all on the board" };

afterEach(cleanup);

describe("NeedsActionSection", () => {
  it("is a region named Needs action with a region per group, named by its heading", () => {
    render(<NeedsActionSection groups={groups([item()], [item({ id: "p2", name: "Shelf lighting", daysText: "9 days" })])} text={text} />);
    const section = screen.getByRole("region", { name: "Needs action" });
    expect(within(section).getByRole("region", { name: "Our move" })).toHaveTextContent("Panel upgrade");
    expect(within(section).getByRole("region", { name: "Waiting for customer" })).toHaveTextContent("Shelf lighting");
  });

  it("links the project first, then the customer, with the stage and the days", () => {
    render(<NeedsActionSection groups={groups([item()])} text={text} />);
    const entry = within(screen.getByRole("region", { name: "Our move" })).getByRole("listitem");
    expect(within(entry).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Panel upgrade", "/projects/p1"],
      ["Acme Ltd", "/customers/acme"],
    ]);
    expect(entry).toHaveTextContent("Quote");
    expect(entry).toHaveTextContent("10 days");
  });

  it("shows the customer as text for a partner's users, and nothing without one", () => {
    render(<NeedsActionSection groups={groups([item(), item({ id: "p2", customerName: null })])} text={text} linkCustomers={false} />);
    const entries = within(screen.getByRole("region", { name: "Our move" })).getAllByRole("listitem");
    expect(within(entries[0]!).getAllByRole("link")).toHaveLength(1);
    expect(entries[0]).toHaveTextContent("Acme Ltd");
    expect(entries[1]).not.toHaveTextContent("Acme Ltd");
  });

  it("shows whose move when the group doesn't say it", () => {
    render(<NeedsActionSection groups={groups([item({ badge: { move: "ready", label: "Ready for next stage" } })])} text={text} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Ready for next stage");
  });

  it("leaves out an empty group", () => {
    render(<NeedsActionSection groups={groups([item()])} text={text} />);
    expect(screen.queryByRole("region", { name: "Waiting for customer" })).not.toBeInTheDocument();
  });

  it("links to the board when a group has more", () => {
    render(<NeedsActionSection groups={groups([item()], [], true)} text={text} />);
    const link = within(screen.getByRole("region", { name: "Our move" })).getByRole("link", { name: "View all on the board" });
    expect(link).toHaveAttribute("href", "/projects?view=board");
  });

  it("says when nothing needs action", () => {
    render(<NeedsActionSection groups={groups([])} text={text} />);
    const section = screen.getByRole("region", { name: "Needs action" });
    expect(section).toHaveTextContent("Nothing needs action.");
    expect(within(section).queryAllByRole("region")).toHaveLength(0);
  });
});
