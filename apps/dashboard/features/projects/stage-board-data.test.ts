import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";

// `stageBoard` with the English catalogue standing in for next-intl's request translations.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
}));

const { stageBoard } = await import("./stage-board-data");

const project = (id: string, stage: string, createdAt: string, overrides: { lifecycle?: string; customerName?: string | null } = {}) => ({
  id,
  name: `Project ${id}`,
  organizationId: "acme",
  customerName: "Acme Ltd",
  lifecycle: "active",
  stage,
  createdAt: new Date(createdAt),
  ...overrides,
});

const cards = (board: Awaited<ReturnType<typeof stageBoard>>, stage: string) =>
  board.phases.flatMap((p) => p.columns).find((c) => c.stage === stage)!.cards;

describe("stageBoard", () => {
  it("names the phases and the stages in the request's language", async () => {
    const board = await stageBoard([], [], new Map(), "2026-11-16");
    expect(board.phases.map((p) => [p.label, p.columns.map((c) => c.label)])).toEqual([
      ["Sales", ["Inquiry", "Quote", "Ordered"]],
      ["Work", ["Scheduled", "In work"]],
      ["Closing", ["Reporting", "Billing", "Closed"]],
    ]);
    expect(board.text).toEqual({ label: "Stage board", empty: "No projects", longWait: "more than 7 days in this stage" });
  });

  it("counts the days from the latest stage change, or the project's creation, longest first", async () => {
    const board = await stageBoard(
      [project("a", "quote", "2026-11-13T10:00:00Z"), project("b", "quote", "2026-10-01T10:00:00Z"), project("c", "quote", "2026-11-15T10:00:00Z")],
      [],
      new Map([["b", new Date("2026-11-04T09:00:00Z")]]),
      "2026-11-16",
    );
    expect(cards(board, "quote").map((c) => [c.id, c.daysText, c.longWait])).toEqual([
      ["b", "12 days", true],
      ["a", "3 days", false],
      ["c", "1 day", false],
    ]);
  });

  it("says whose move it is from the project's ticks, and Canceled on a canceled project", async () => {
    const board = await stageBoard(
      [project("a", "quote", "2026-11-13T10:00:00Z"), project("b", "quote", "2026-11-12T10:00:00Z", { lifecycle: "canceled" })],
      [{ projectId: "a", item: "quote.costed" }, { projectId: "a", item: "quote.sent" }],
      new Map(),
      "2026-11-16",
    );
    expect(cards(board, "quote").map((c) => [c.id, c.move, c.moveLabel])).toEqual([
      ["b", null, "Canceled"],
      ["a", "waiting_for_customer", "Waiting for customer"],
    ]);
  });
});
