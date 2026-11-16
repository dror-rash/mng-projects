import { describe, expect, it } from "vitest";

import { NEEDS_ACTION_LIMIT, needsAction, waitingSince } from "./needs-action";

const TODAY = "2026-11-16";

/** `days` before today at noon UTC. */
const daysAgo = (days: number) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - days * 86_400_000);

const project = (id: string, stage: string, overrides: { lifecycle?: string; createdAt?: Date; name?: string } = {}) => ({
  id,
  name: `Project ${id}`,
  stage,
  lifecycle: "active",
  createdAt: daysAgo(100),
  ...overrides,
});

const tick = (projectId: string, item: string, days: number) => ({ projectId, item, tickedAt: daysAgo(days) });

const names = (groups: ReturnType<typeof needsAction>) =>
  Object.fromEntries(groups.map((g) => [g.group, g.projects.map((p) => [p.id, p.days])]));

describe("waitingSince", () => {
  it("is the stage's start without ticks", () => {
    expect(waitingSince("quote", "2026-11-01", [])).toBe("2026-11-01");
  });

  it("is the latest tick of the current stage's items when it is later than the stage's start", () => {
    const ticks = [
      { item: "quote.costed", tickedAt: new Date("2026-11-05T09:00:00Z") },
      { item: "quote.sent", tickedAt: new Date("2026-11-07T23:30:00Z") },
    ];
    expect(waitingSince("quote", "2026-11-01", ticks)).toBe("2026-11-07");
  });

  it("keeps the stage's start when its ticks are older (ticked before the project moved back)", () => {
    expect(waitingSince("quote", "2026-11-10", [{ item: "quote.costed", tickedAt: new Date("2026-11-05T09:00:00Z") }])).toBe("2026-11-10");
  });

  it("ignores the ticks of other stages", () => {
    const ticks = [{ item: "inquiry.logged", tickedAt: new Date("2026-11-12T09:00:00Z") }];
    expect(waitingSince("quote", "2026-11-01", ticks)).toBe("2026-11-01");
  });
});

describe("needsAction", () => {
  it("puts our move and Ready for next stage under Our move, and the customer's move under Waiting for customer", () => {
    const groups = needsAction(
      [project("ours", "quote"), project("ready", "ordered"), project("theirs", "quote")],
      [
        tick("ready", "ordered.work_order", 20),
        tick("ready", "ordered.payment_terms", 20),
        tick("theirs", "quote.costed", 30),
        tick("theirs", "quote.sent", 30),
      ],
      new Map([
        ["ours", daysAgo(10)],
        ["ready", daysAgo(30)],
        ["theirs", daysAgo(40)],
      ]),
      TODAY,
    );
    expect(groups.map((g) => g.group)).toEqual(["our_move", "waiting_for_customer"]);
    expect(names(groups)).toEqual({ our_move: [["ready", 20], ["ours", 10]], waiting_for_customer: [["theirs", 30]] });
    expect(groups[0]!.projects.map((p) => p.move)).toEqual(["ready", "our_move"]);
  });

  it("lists only waits of more than 7 days, counted from the stage's start or the project's creation", () => {
    const groups = needsAction(
      [project("seven", "quote"), project("eight", "quote"), project("new", "quote", { createdAt: daysAgo(9) })],
      [],
      new Map([
        ["seven", daysAgo(7)],
        ["eight", daysAgo(8)],
      ]),
      TODAY,
    );
    expect(names(groups)).toEqual({ our_move: [["new", 9], ["eight", 8]], waiting_for_customer: [] });
  });

  it("restarts the wait at the latest tick of the current stage", () => {
    const groups = needsAction(
      [project("a", "quote"), project("b", "quote")],
      [tick("a", "quote.costed", 2), tick("b", "inquiry.logged", 1)],
      new Map([
        ["a", daysAgo(10)],
        ["b", daysAgo(10)],
      ]),
      TODAY,
    );
    expect(names(groups)).toEqual({ our_move: [["b", 10]], waiting_for_customer: [] });
  });

  it("leaves out canceled projects and finished ones (Closed with its item done)", () => {
    const groups = needsAction(
      [project("canceled", "quote", { lifecycle: "canceled" }), project("done", "closed"), project("open", "closed")],
      [tick("done", "closed.completion_report", 20)],
      new Map([
        ["canceled", daysAgo(20)],
        ["done", daysAgo(20)],
        ["open", daysAgo(20)],
      ]),
      TODAY,
    );
    expect(names(groups)).toEqual({ our_move: [["open", 20]], waiting_for_customer: [] });
  });

  it("orders the longest wait first, then by name", () => {
    const groups = needsAction(
      [project("b", "quote", { name: "Beta" }), project("a", "quote", { name: "Alpha" }), project("c", "quote", { name: "Gamma" })],
      [],
      new Map([
        ["b", daysAgo(9)],
        ["a", daysAgo(9)],
        ["c", daysAgo(30)],
      ]),
      TODAY,
    );
    expect(groups[0]!.projects.map((p) => p.name)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it(`keeps at most ${NEEDS_ACTION_LIMIT} per group and says there are more`, () => {
    const many = Array.from({ length: NEEDS_ACTION_LIMIT + 1 }, (_, i) => project(`p${i}`, "quote"));
    const changedAt = new Map(many.map((p, i) => [p.id, daysAgo(10 + i)]));
    const [ours, theirs] = needsAction(many, [], changedAt, TODAY);
    expect(ours!.projects).toHaveLength(NEEDS_ACTION_LIMIT);
    expect(ours!.projects[0]!.id).toBe(`p${NEEDS_ACTION_LIMIT}`);
    expect(ours!.more).toBe(true);
    expect(theirs!.more).toBe(false);

    const [exactly] = needsAction(many.slice(1), [], changedAt, TODAY);
    expect(exactly!.more).toBe(false);
  });
});
