import { describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";

// `nextStep` with the English catalogue standing in for next-intl's request translations.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    let node: unknown = (en as Record<string, unknown>)[namespace];
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    return String(node).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name]));
  },
}));

const { nextStep } = await import("./next-step");

const tick = (item: string, tickedByName: string | null = "Dana Admin", tickedOn = "2026-11-10") => ({ item, tickedByName, tickedOn });

describe("nextStep", () => {
  it("labels the current stage's items with their party, in order", async () => {
    const next = await nextStep("quote", []);
    expect(next.heading).toBe("Next step");
    expect(next.items.map((i) => [i.label, i.party, i.done])).toEqual([
      ["Materials and labour costed", "Us", false],
      ["Quote sent to the customer", "Us", false],
      ["Customer accepted the quote", "Customer", false],
    ]);
    expect([next.move, next.moveLabel, next.progress]).toEqual(["our_move", "Our move", "0 of 3 done"]);
  });

  it("counts only the current stage's ticks in N of M and the badge", async () => {
    const next = await nextStep("ordered", [tick("quote.costed"), tick("quote.sent"), tick("quote.accepted"), tick("ordered.payment_terms")]);
    expect(next.progress).toBe("1 of 2 done");
    expect([next.move, next.moveLabel]).toEqual(["waiting_for_customer", "Waiting for customer"]);
  });

  it("shows who ticked an item and the day, with no name once their account is deleted", async () => {
    const next = await nextStep("quote", [tick("quote.costed"), tick("quote.sent", null, "2026-11-12")]);
    expect(next.items.map(({ done, tickedBy, tickedOn }) => ({ done, tickedBy, tickedOn }))).toEqual([
      { done: true, tickedBy: "Dana Admin", tickedOn: "2026-11-10" },
      { done: true, tickedBy: null, tickedOn: "2026-11-12" },
      { done: false, tickedBy: null, tickedOn: null },
    ]);
    expect(next.items[0]!.tickedOnText).toMatch(/2026/);
  });

  it("calls a Closed project with its item ticked complete", async () => {
    const next = await nextStep("closed", [tick("closed.completion_report")]);
    expect([next.move, next.moveLabel, next.progress]).toEqual(["complete", "Job complete", "1 of 1 done"]);
  });

  it("offers the move to the next stage, named in the request's language", async () => {
    const next = await nextStep("quote", []);
    expect(next.moveTo).toEqual({ stage: "ordered", label: "Move to Ordered", moveAnyway: "Move anyway", cancel: "Cancel" });
    expect((await nextStep("in_work", [])).moveTo?.label).toBe("Move to Reporting");
  });

  it("has no next stage at Closed", async () => {
    expect((await nextStep("closed", [])).moveTo).toBeUndefined();
  });
});
