import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import he from "../../messages/he.json";

import {
  nextStage,
  parseProjectStage,
  parseStageChoice,
  PROJECT_STAGES,
  projectStage,
  projectStageLabelKey,
  STAGE_PHASES,
} from "./project-stage";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
};

describe("PROJECT_STAGES", () => {
  it("lists the eight stages in the flow's order (ADR-0012)", () => {
    expect(PROJECT_STAGES.map((s) => s.stage)).toEqual([
      "inquiry",
      "quote",
      "ordered",
      "scheduled",
      "in_work",
      "reporting",
      "billing",
      "closed",
    ]);
  });

  it("has a label for every stage in English and Hebrew", () => {
    expect(PROJECT_STAGES.map((s) => en.projectStage[s.labelKey])).toEqual([
      "Inquiry",
      "Quote",
      "Ordered",
      "Scheduled",
      "In work",
      "Reporting",
      "Billing",
      "Closed",
    ]);
    expect(PROJECT_STAGES.map((s) => he.projectStage[s.labelKey])).toEqual([
      "פנייה",
      "הצעת מחיר",
      "הוזמן",
      "מתואם",
      "בביצוע",
      "דוחות",
      "חיוב",
      "סגור",
    ]);
  });
});

describe("parseProjectStage", () => {
  it("accepts a stored stage", () => {
    expect(parseProjectStage("in_work")).toBe("in_work");
    expect(parseProjectStage("closed")).toBe("closed");
  });

  it("rejects anything else, labels included", () => {
    expect(parseProjectStage("In work")).toBeNull();
    expect(parseProjectStage("made_up")).toBeNull();
    expect(parseProjectStage("")).toBeNull();
    expect(parseProjectStage(null)).toBeNull();
  });
});

describe("projectStage", () => {
  it("gives a stored stage, and Inquiry for an unknown one", () => {
    expect(projectStage("billing")).toBe("billing");
    expect(projectStage("archived")).toBe("inquiry");
  });
});

describe("projectStageLabelKey", () => {
  it("gives the message key for a stored stage", () => {
    expect(projectStageLabelKey("in_work")).toBe("inWork");
    expect(projectStageLabelKey("quote")).toBe("quote");
  });

  it("shows an unknown stored value as Inquiry", () => {
    expect(projectStageLabelKey("made_up")).toBe("inquiry");
  });
});

describe("parseStageChoice", () => {
  it("reads the chosen stage", () => {
    expect(parseStageChoice(form({ stage: "quote" }))).toEqual({ ok: true, value: "quote" });
  });

  it("is undefined when the form has no Stage field", () => {
    expect(parseStageChoice(form({}))).toEqual({ ok: true, value: undefined });
  });

  it("refuses an empty or made-up stage on the Stage field", () => {
    for (const stage of ["", "Made up", "In work"]) {
      expect(parseStageChoice(form({ stage }))).toEqual({ ok: false, field: "stage", error: "Choose a stage" });
    }
  });
});

describe("STAGE_PHASES", () => {
  it("puts every stage under one phase, in the flow's order (ADR-0014)", () => {
    expect(STAGE_PHASES.map((p) => [p.phase, [...p.stages]])).toEqual([
      ["sales", ["inquiry", "quote", "ordered"]],
      ["work", ["scheduled", "in_work"]],
      ["closing", ["reporting", "billing", "closed"]],
    ]);
    expect(STAGE_PHASES.flatMap((p) => p.stages)).toEqual(PROJECT_STAGES.map((s) => s.stage));
  });

  it("has a label for every phase in English and Hebrew", () => {
    expect(STAGE_PHASES.map((p) => en.projectStage.phase[p.labelKey])).toEqual(["Sales", "Work", "Closing"]);
    expect(STAGE_PHASES.map((p) => he.projectStage.phase[p.labelKey])).toEqual(["מכירה", "ביצוע", "סגירה"]);
  });
});

describe("nextStage", () => {
  it("gives the stage after a stored one in the flow", () => {
    expect(nextStage("inquiry")).toBe("quote");
    expect(nextStage("in_work")).toBe("reporting");
    expect(nextStage("billing")).toBe("closed");
  });

  it("is null at Closed", () => {
    expect(nextStage("closed")).toBeNull();
  });

  it("counts an unknown stored value as Inquiry", () => {
    expect(nextStage("made_up")).toBe("quote");
  });
});
