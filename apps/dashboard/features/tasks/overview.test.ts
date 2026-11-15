import { describe, expect, it } from "vitest";

import { overviewWindow, summarizeOverview } from "./overview";

type Counts = { count: number; overdue: number; dueSoon: number; created: number; completed: number };
const row = (status: string, counts: Partial<Counts>) => ({
  status,
  count: 0,
  overdue: 0,
  dueSoon: 0,
  created: 0,
  completed: 0,
  ...counts,
});

describe("overviewWindow", () => {
  const now = new Date("2026-10-22T12:00:00Z");

  it("uses today's UTC date and the six days after it for due soon", () => {
    expect(overviewWindow(now)).toMatchObject({ today: "2026-10-22", dueSoonUntil: "2026-10-28" });
  });

  it("starts this week's activity exactly seven days before now", () => {
    expect(overviewWindow(now).since).toEqual(new Date("2026-10-15T12:00:00Z"));
  });

  it("takes today from UTC, not the server's time zone", () => {
    expect(overviewWindow(new Date("2026-10-22T23:30:00-05:00")).today).toBe("2026-10-23");
  });
});

describe("summarizeOverview", () => {
  const rows = [
    row("todo", { count: 4, overdue: 1, dueSoon: 2, created: 3 }),
    row("in_progress", { count: 2, overdue: 1, dueSoon: 0, created: 1 }),
    row("done", { count: 3, overdue: 2, dueSoon: 1, created: 1, completed: 2 }),
  ];

  it("summarizes totals, open tasks and the completion rate", () => {
    expect(summarizeOverview(rows).summary).toEqual({ total: 9, done: 3, open: 6, completionRate: 33 });
  });

  it("counts overdue and due-soon tasks only when they are not done", () => {
    expect(summarizeOverview(rows)).toMatchObject({ overdue: 2, dueSoon: 2 });
  });

  it("adds up this week's created and completed tasks across every status", () => {
    expect(summarizeOverview(rows).thisWeek).toEqual({ created: 5, completed: 2 });
  });

  it("lists every board column in order, with zero for an empty one", () => {
    expect(summarizeOverview([row("done", { count: 3 })]).byStatus).toEqual([
      { label: "To do", value: 0, slot: 1 },
      { label: "In progress", value: 0, slot: 4 },
      { label: "Done", value: 3, slot: 3 },
    ]);
  });

  it("puts an unknown status in the To do column and counts its due dates", () => {
    const overview = summarizeOverview([row("legacy", { count: 2, overdue: 1 }), row("todo", { count: 1 })]);

    expect(overview.byStatus[0]).toEqual({ label: "To do", value: 3, slot: 1 });
    expect(overview.overdue).toBe(1);
  });

  it("is all zeros for a workspace without tasks", () => {
    expect(summarizeOverview([])).toEqual({
      summary: { total: 0, done: 0, open: 0, completionRate: 0 },
      overdue: 0,
      dueSoon: 0,
      thisWeek: { created: 0, completed: 0 },
      byStatus: [
        { label: "To do", value: 0, slot: 1 },
        { label: "In progress", value: 0, slot: 4 },
        { label: "Done", value: 0, slot: 3 },
      ],
    });
  });
});

