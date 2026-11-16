import { describe, expect, it } from "vitest";

import { boardPhases, daysInStage, isLongWait, movesByProject, stageSince } from "./stage-board";

describe("stageSince", () => {
  it("is the day of the latest stage change, UTC", () => {
    expect(stageSince(new Date("2026-11-03T23:30:00Z"), new Date("2026-10-01T08:00:00Z"))).toBe("2026-11-03");
  });

  it("is the day the project was made when it has no stage change", () => {
    expect(stageSince(null, new Date("2026-10-01T08:00:00Z"))).toBe("2026-10-01");
  });
});

describe("daysInStage", () => {
  it("counts the calendar days since the stage started", () => {
    expect(daysInStage("2026-11-04", "2026-11-16")).toBe(12);
    expect(daysInStage("2026-10-31", "2026-11-01")).toBe(1);
  });

  it("is 0 on the day the stage started, and never less", () => {
    expect(daysInStage("2026-11-16", "2026-11-16")).toBe(0);
    expect(daysInStage("2026-11-17", "2026-11-16")).toBe(0);
  });
});

describe("isLongWait", () => {
  it("marks more than 7 days in the stage", () => {
    expect(isLongWait(7)).toBe(false);
    expect(isLongWait(8)).toBe(true);
    expect(isLongWait(0)).toBe(false);
  });
});

describe("movesByProject", () => {
  const tick = (projectId: string, item: string) => ({ projectId, item });

  it("works out whose move it is from each project's own ticks", () => {
    const moves = movesByProject(
      [
        { id: "a", stage: "quote" },
        { id: "b", stage: "quote" },
        { id: "c", stage: "closed" },
      ],
      [tick("b", "quote.costed"), tick("b", "quote.sent"), tick("c", "closed.completion_report"), tick("a", "inquiry.logged")],
    );
    expect(moves).toEqual(new Map([["a", "our_move"], ["b", "waiting_for_customer"], ["c", "complete"]]));
  });
});

describe("boardPhases", () => {
  const project = (id: string, stage: string, days: number) => ({ id, stage, days });

  it("gives every stage a column under its phase, in the flow's order, empty ones too", () => {
    const phases = boardPhases([project("a", "quote", 1), project("b", "in_work", 2)]);
    expect(phases.map((p) => [p.phase, p.columns.map((c) => [c.stage, c.projects.map((x) => x.id)])])).toEqual([
      ["sales", [["inquiry", []], ["quote", ["a"]], ["ordered", []]]],
      ["work", [["scheduled", []], ["in_work", ["b"]]]],
      ["closing", [["reporting", []], ["billing", []], ["closed", []]]],
    ]);
  });

  it("lists the longest in the stage first", () => {
    const phases = boardPhases([project("a", "quote", 3), project("b", "quote", 12), project("c", "quote", 5)]);
    expect(phases[0]!.columns[1]!.projects.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("puts a project with an unknown stored stage under Inquiry", () => {
    const phases = boardPhases([project("a", "archived", 1)]);
    expect(phases[0]!.columns[0]!.projects.map((p) => p.id)).toEqual(["a"]);
  });

  it("carries each phase's and stage's message key", () => {
    const phases = boardPhases([]);
    expect(phases.map((p) => p.labelKey)).toEqual(["sales", "work", "closing"]);
    expect(phases[1]!.columns.map((c) => c.labelKey)).toEqual(["scheduled", "inWork"]);
  });
});
