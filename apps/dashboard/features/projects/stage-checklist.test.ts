import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import he from "../../messages/he.json";

import { PROJECT_STAGES } from "./project-stage";
import {
  checklistFor,
  openItemCount,
  parseChecklistItem,
  STAGE_CHECKLIST,
  WHOSE_MOVE,
  whoseMove,
  whoseMoveChartSlot,
  whoseMoveLabelKey,
} from "./stage-checklist";

describe("STAGE_CHECKLIST", () => {
  it("lists the twenty items in display order, stage by stage", () => {
    expect(STAGE_CHECKLIST.map((i) => i.key)).toEqual([
      "inquiry.details_recorded",
      "inquiry.logged",
      "quote.costed",
      "quote.sent",
      "quote.accepted",
      "ordered.work_order",
      "ordered.payment_terms",
      "scheduled.date_set",
      "scheduled.crew_assigned",
      "scheduled.customer_confirmed",
      "in_work.visits_done",
      "in_work.materials_reported",
      "in_work.reports_handed_over",
      "reporting.prepared",
      "reporting.sent",
      "reporting.received",
      "billing.prepared",
      "billing.sent",
      "billing.received",
      "closed.completion_report",
    ]);
  });

  it("gives every stage at least one item, in the stages' order", () => {
    const stages = [...new Set(STAGE_CHECKLIST.map((i) => i.stage))];
    expect(stages).toEqual(PROJECT_STAGES.map((s) => s.stage));
  });

  it("marks what the customer does, and the rest as ours", () => {
    expect(STAGE_CHECKLIST.filter((i) => i.party === "customer").map((i) => i.key)).toEqual([
      "quote.accepted",
      "ordered.work_order",
      "scheduled.customer_confirmed",
      "reporting.received",
      "billing.received",
    ]);
    expect(STAGE_CHECKLIST.every((i) => i.party === "us" || i.party === "customer")).toBe(true);
  });

  it("has the same keys as the database's check", () => {
    const migrations = fileURLToPath(new URL("../../../../packages/db/migrations/", import.meta.url));
    const file = readdirSync(migrations).find((name) => name.endsWith("_project_checklist.sql"));
    expect(file).toBeDefined();
    const check = /"item" in \(([^)]*)\)/.exec(readFileSync(`${migrations}${file}`, "utf8"))?.[1] ?? "";
    expect(check.split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual(STAGE_CHECKLIST.map((i) => i.key));
  });

  it("has a label for every item in English and Hebrew", () => {
    for (const item of STAGE_CHECKLIST) {
      expect(en.stageChecklist.items).toHaveProperty(item.labelKey);
      expect(he.stageChecklist.items).toHaveProperty(item.labelKey);
    }
    expect(checklistFor("quote").map((i) => en.stageChecklist.items[i.labelKey])).toEqual([
      "Materials and labour costed",
      "Quote sent to the customer",
      "Customer accepted the quote",
    ]);
    expect(checklistFor("quote").map((i) => he.stageChecklist.items[i.labelKey])).toEqual([
      "תמחיר חומרים וכוח אדם",
      "ההצעה נשלחה ללקוח",
      "הלקוח אישר את ההצעה",
    ]);
  });
});

describe("checklistFor", () => {
  it("gives a stage's items in order", () => {
    expect(checklistFor("ordered").map((i) => i.key)).toEqual(["ordered.work_order", "ordered.payment_terms"]);
    expect(checklistFor("closed").map((i) => i.key)).toEqual(["closed.completion_report"]);
  });

  it("gives Inquiry's items for an unknown stored stage", () => {
    expect(checklistFor("made_up").map((i) => i.key)).toEqual(["inquiry.details_recorded", "inquiry.logged"]);
  });
});

describe("parseChecklistItem", () => {
  it("takes an item's key", () => {
    expect(parseChecklistItem("quote.sent")).toBe("quote.sent");
  });

  it("refuses anything else", () => {
    for (const value of [null, "", "quote", "Quote sent", "quote.made_up", 3]) {
      expect(parseChecklistItem(value)).toBeNull();
    }
  });
});

describe("whoseMove", () => {
  it("is our move while the first open item is ours", () => {
    expect(whoseMove("quote", [])).toBe("our_move");
    expect(whoseMove("quote", ["quote.costed"])).toBe("our_move");
  });

  it("waits for the customer while the first open item is theirs", () => {
    expect(whoseMove("quote", ["quote.costed", "quote.sent"])).toBe("waiting_for_customer");
    expect(whoseMove("ordered", [])).toBe("waiting_for_customer");
  });

  it("goes by the first open item in order, whatever is ticked after it", () => {
    expect(whoseMove("quote", ["quote.accepted"])).toBe("our_move");
    expect(whoseMove("ordered", ["ordered.payment_terms"])).toBe("waiting_for_customer");
  });

  it("is ready for the next stage when every item is done", () => {
    expect(whoseMove("quote", ["quote.costed", "quote.sent", "quote.accepted"])).toBe("ready");
  });

  it("ignores other stages' ticks", () => {
    expect(whoseMove("ordered", ["quote.costed", "quote.sent", "quote.accepted"])).toBe("waiting_for_customer");
  });

  it("calls a Closed project with everything done complete", () => {
    expect(whoseMove("closed", [])).toBe("our_move");
    expect(whoseMove("closed", ["closed.completion_report"])).toBe("complete");
  });
});

describe("whoseMoveLabelKey", () => {
  it("has the badges' texts in English and Hebrew", () => {
    expect(WHOSE_MOVE.map((m) => en.stageChecklist.move[whoseMoveLabelKey(m.move)])).toEqual([
      "Our move",
      "Waiting for customer",
      "Ready for next stage",
      "Job complete",
    ]);
    expect(WHOSE_MOVE.map((m) => he.stageChecklist.move[whoseMoveLabelKey(m.move)])).toEqual([
      "תורנו",
      "ממתין ללקוח",
      "מוכן לשלב הבא",
      "העבודה הושלמה",
    ]);
  });
});

describe("whoseMoveChartSlot", () => {
  it("colors the badge from the chart palette: amber for our move, blue while waiting, green when done", () => {
    expect(WHOSE_MOVE.map((m) => [m.move, whoseMoveChartSlot(m.move)])).toEqual([
      ["our_move", 4],
      ["waiting_for_customer", 1],
      ["ready", 3],
      ["complete", 3],
    ]);
  });
});

describe("openItemCount", () => {
  it("counts the stage's items not yet ticked", () => {
    expect(openItemCount("quote", [])).toBe(3);
    expect(openItemCount("quote", ["quote.costed"])).toBe(2);
    expect(openItemCount("quote", ["quote.costed", "quote.sent", "quote.accepted"])).toBe(0);
  });

  it("ignores other stages' ticks", () => {
    expect(openItemCount("ordered", ["quote.costed", "quote.sent", "quote.accepted"])).toBe(2);
  });
});
