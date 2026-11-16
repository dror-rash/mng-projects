import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";

// `needsActionSection` with the English catalogue standing in for next-intl's request translations.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
}));

const { needsActionSection } = await import("./needs-action-data");

const project = (id: string, stage: string, overrides: { name?: string; customerName?: string | null } = {}) => ({
  id,
  name: `Project ${id}`,
  organizationId: "acme",
  customerName: "Acme Ltd",
  lifecycle: "active",
  stage,
  createdAt: new Date("2026-09-01T10:00:00Z"),
  ...overrides,
});

describe("needsActionSection", () => {
  it("names the section and its groups in the request's language", async () => {
    const section = await needsActionSection([], [], new Map(), "2026-11-16");
    expect(section.text).toEqual({ heading: "Needs action", empty: "Nothing needs action.", viewAll: "View all on the board" });
    expect(section.groups.map((g) => [g.group, g.label, g.items, g.more])).toEqual([
      ["our_move", "Our move", [], false],
      ["waiting_for_customer", "Waiting for customer", [], false],
    ]);
  });

  it("lists each project with its customer, stage and days, and whose move only when it is Ready", async () => {
    const section = await needsActionSection(
      [project("a", "quote"), project("b", "ordered", { customerName: null })],
      [
        { projectId: "b", item: "ordered.work_order", tickedAt: new Date("2026-11-01T10:00:00Z") },
        { projectId: "b", item: "ordered.payment_terms", tickedAt: new Date("2026-11-01T10:00:00Z") },
      ],
      new Map([
        ["a", new Date("2026-11-06T10:00:00Z")],
        ["b", new Date("2026-10-01T10:00:00Z")],
      ]),
      "2026-11-16",
    );
    expect(section.groups[0]!.items).toEqual([
      {
        id: "b",
        name: "Project b",
        organizationId: "acme",
        customerName: null,
        stageLabel: "Ordered",
        daysText: "15 days",
        badge: { move: "ready", label: "Ready for next stage" },
      },
      { id: "a", name: "Project a", organizationId: "acme", customerName: "Acme Ltd", stageLabel: "Quote", daysText: "10 days", badge: null },
    ]);
  });
});
