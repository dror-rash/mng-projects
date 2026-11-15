import { describe, expect, it } from "vitest";

import { groupTasksByStatus, parseTaskStatus, TASK_STATUSES } from "./task-status";

describe("TASK_STATUSES", () => {
  it("lists the board columns in workflow order", () => {
    expect(TASK_STATUSES.map((s) => s.label)).toEqual(["To do", "In progress", "Done"]);
  });
});

describe("parseTaskStatus", () => {
  it("accepts a known status", () => {
    expect(parseTaskStatus("in_progress")).toBe("in_progress");
  });

  it("rejects an unknown status", () => {
    expect(parseTaskStatus("archived")).toBeNull();
  });

  it("rejects a missing value", () => {
    expect(parseTaskStatus(null)).toBeNull();
  });
});

describe("groupTasksByStatus", () => {
  it("gives each column its chart slot: In progress is amber, leaving orange-red to the accent", () => {
    expect(groupTasksByStatus([])).toMatchObject([
      { status: "todo", chartSlot: 1 },
      { status: "in_progress", chartSlot: 4 },
      { status: "done", chartSlot: 3 },
    ]);
  });

  it("puts each task in its status column and keeps empty columns", () => {
    const tasks = [
      { id: "1", status: "done" },
      { id: "2", status: "todo" },
      { id: "3", status: "todo" },
    ];

    const columns = groupTasksByStatus(tasks);

    expect(columns.map((c) => [c.status, c.tasks.map((t) => t.id)])).toEqual([
      ["todo", ["2", "3"]],
      ["in_progress", []],
      ["done", ["1"]],
    ]);
  });

  it("treats a task with an unknown status as to do", () => {
    const columns = groupTasksByStatus([{ id: "1", status: "legacy" }]);

    expect(columns[0]!.tasks.map((t) => t.id)).toEqual(["1"]);
  });
});
