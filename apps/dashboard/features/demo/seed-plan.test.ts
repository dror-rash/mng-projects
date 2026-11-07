import { describe, expect, it } from "vitest";

import { ORGANIZATION_STATUSES } from "@/features/organizations/organization-kinds";
import { fieldInputName, parseReadingValues, type ReadingField, YES_NO } from "@/features/readings/reading-values";
import { TASK_PRIORITIES } from "@/features/tasks/task-priority";
import { TASK_STATUSES } from "@/features/tasks/task-status";

import { buildDemoPlan, DEMO_FORM, DEMO_TAG, demoReadingValues } from "./seed-plan";

const now = new Date("2026-10-30T12:00:00Z");
const today = "2026-10-30";
const plan = buildDemoPlan(now);
const projects = plan.flatMap((c) => c.projects);
const tasks = projects.flatMap((p) => p.tasks);
const open = tasks.filter((t) => t.status !== "done");

describe("buildDemoPlan", () => {
  it("makes 5 customers with 15 projects each", () => {
    expect(plan).toHaveLength(5);
    expect(plan.map((c) => c.projects.length)).toEqual([15, 15, 15, 15, 15]);
  });

  it("tags every customer so a rerun can find and replace them", () => {
    expect(plan.every((c) => c.tags.includes(DEMO_TAG))).toBe(true);
  });

  it("uses every customer status", () => {
    expect(new Set(plan.map((c) => c.status))).toEqual(new Set(ORGANIZATION_STATUSES.map((s) => s.status)));
  });

  it("uses every task status and priority", () => {
    expect(new Set(tasks.map((t) => t.status))).toEqual(new Set(TASK_STATUSES.map((s) => s.status)));
    expect(new Set(tasks.map((t) => t.priority))).toEqual(new Set(TASK_PRIORITIES.map((p) => p.priority)));
  });

  it("gives each customer an empty project, a finished one and one not started", () => {
    for (const customer of plan) {
      const states = customer.projects.map((p) => p.tasks);
      expect(states.some((t) => t.length === 0)).toBe(true);
      expect(states.some((t) => t.length > 0 && t.every((x) => x.status === "done"))).toBe(true);
      expect(states.some((t) => t.length > 0 && t.every((x) => x.status === "todo"))).toBe(true);
    }
  });

  it("has open tasks that are overdue, due this week and undated", () => {
    expect(open.some((t) => t.dueDate !== null && t.dueDate < today)).toBe(true);
    expect(open.some((t) => t.dueDate !== null && t.dueDate >= today && t.dueDate <= "2026-11-05")).toBe(true);
    expect(open.some((t) => t.dueDate === null)).toBe(true);
  });

  it("completes done tasks in the past, some within the last week", () => {
    const done = tasks.filter((t) => t.status === "done");
    expect(done.every((t) => t.completedAt !== null && t.completedAt <= now)).toBe(true);
    expect(done.some((t) => now.getTime() - t.completedAt!.getTime() < 7 * 86_400_000)).toBe(true);
    expect(open.every((t) => t.completedAt === null)).toBe(true);
  });

  it("assigns some tasks to me and leaves others unassigned", () => {
    expect(tasks.some((t) => t.assignedToMe)).toBe(true);
    expect(tasks.some((t) => !t.assignedToMe)).toBe(true);
  });

  it("starts projects at different times, all in the past", () => {
    const starts = projects.map((p) => p.createdAt.getTime());
    expect(new Set(starts).size).toBeGreaterThan(10);
    expect(starts.every((s) => s <= now.getTime())).toBe(true);
  });

  it("gives each customer contacts with one primary, and notes", () => {
    for (const customer of plan) {
      expect(customer.contacts.length).toBeGreaterThanOrEqual(2);
      expect(customer.contacts.filter((c) => c.primary)).toHaveLength(1);
      expect(customer.notes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("is the same for the same day", () => {
    expect(buildDemoPlan(now)).toEqual(plan);
  });

  it("gives one customer two sub-companies, each with some of its projects (task 053)", () => {
    const groups = plan.filter((c) => c.subCompanies.length > 0);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group!.subCompanies).toHaveLength(2);
    for (const sub of group!.subCompanies) {
      expect(group!.projects.filter((p) => p.subCompany === sub.name).length).toBeGreaterThan(0);
    }
    expect(group!.projects.some((p) => p.subCompany === null)).toBe(true);
  });

  it("gives every customer a site with someone to meet there, and each sub-company one too (task 054)", () => {
    for (const customer of plan) {
      expect(customer.sites.length).toBeGreaterThan(0);
      expect(customer.sites.every((site) => site.contacts.length > 0)).toBe(true);
      for (const sub of customer.subCompanies) {
        expect(sub.sites.length).toBeGreaterThan(0);
      }
    }
    const coordinates = plan.flatMap((c) => c.sites).filter((site) => site.latitude !== null);
    expect(coordinates.length).toBeGreaterThan(0);
  });

  it("puts every project at a site of its customer, or of its sub-company (task 055)", () => {
    for (const customer of plan) {
      for (const project of customer.projects) {
        const owner = project.subCompany ? customer.subCompanies.find((s) => s.name === project.subCompany)! : customer;
        expect(owner.sites.map((s) => s.name)).toContain(project.site);
      }
    }
  });

  it("visits every started project 1 to 4 times, and no project that hasn't started (task 076)", () => {
    for (const project of projects) {
      const started = project.tasks.some((t) => t.status !== "todo");
      if (started) {
        expect(project.visits.length).toBeGreaterThanOrEqual(1);
        expect(project.visits.length).toBeLessThanOrEqual(4);
      } else {
        expect(project.visits).toEqual([]);
      }
    }
    expect(projects.some((p) => p.visits.length > 1)).toBe(true);
  });

  it("visits on past days, not before the project started, with notes (task 076)", () => {
    for (const project of projects) {
      const started = project.createdAt.toISOString().slice(0, 10);
      for (const visit of project.visits) {
        expect(visit.visitedOn < today).toBe(true);
        expect(visit.visitedOn >= started).toBe(true);
        expect(visit.recordedAt.toISOString().slice(0, 10)).toBe(visit.visitedOn);
        expect(visit.recordedAt.getTime()).toBeLessThan(now.getTime());
        expect(visit.notes.trim()).not.toBe("");
      }
    }
  });

  it("gives at least one visit of every customer a reading (task 076)", () => {
    for (const customer of plan) {
      expect(customer.projects.flatMap((p) => p.visits).some((v) => v.reading !== null)).toBe(true);
    }
    expect(projects.flatMap((p) => p.visits).some((v) => v.reading === null)).toBe(true);
  });
});

describe("DEMO_FORM (task 076)", () => {
  it("is named for the demo, with a Number field with a unit, a Yes/no, a Choice with options, and a Text field", () => {
    expect(DEMO_FORM.name).toBe("Site inspection (demo)");
    const byType = (type: string) => DEMO_FORM.fields.filter((f) => f.type === type);
    expect(byType("number").some((f) => f.unit)).toBe(true);
    expect(byType("yes_no").length).toBeGreaterThan(0);
    expect(byType("choice").every((f) => (f.options?.length ?? 0) >= 2)).toBe(true);
    expect(byType("choice").length).toBeGreaterThan(0);
    expect(byType("text").length).toBeGreaterThan(0);
  });
});

/** A stored value as the reading form posts it. */
function posted(field: ReadingField, value: unknown): string {
  if (field.type === "yes_no") return YES_NO.find((o) => o.stored === value)!.value;
  return String(value);
}

/** Whether `parseReadingValues` accepts `values` for `fields` and stores them unchanged. */
function accepted(fields: ReadingField[], values: Record<string, unknown>) {
  const formData = new FormData();
  for (const field of fields) {
    if (field.id in values) formData.set(fieldInputName(field.id), posted(field, values[field.id]));
  }
  return parseReadingValues(formData, fields);
}

describe("demoReadingValues (task 076)", () => {
  const formFields: ReadingField[] = DEMO_FORM.fields.map((f, i) => ({ id: `f${i}`, ...f }));
  const readings = projects.flatMap((p) => p.visits).filter((v) => v.reading !== null);

  it("gives values the reading form accepts for the demo form's fields, for every reading in the plan", () => {
    for (const visit of readings) {
      const values = demoReadingValues(formFields, visit.reading!, visit.visitedOn);
      expect(accepted(formFields, values)).toEqual({ ok: true, value: values });
    }
  });

  it("fills in every field of the demo form", () => {
    const values = demoReadingValues(formFields, readings[0]!.reading!, readings[0]!.visitedOn);
    expect(Object.keys(values).sort()).toEqual(formFields.map((f) => f.id).sort());
  });

  it("varies the values from one reading to the next", () => {
    const all = readings.map((v) => JSON.stringify(demoReadingValues(formFields, v.reading!, v.visitedOn)));
    expect(new Set(all).size).toBeGreaterThan(1);
  });

  it("fills in a reused form's fields of any type, required ones included", () => {
    const fields: ReadingField[] = [
      { id: "a", label: "Pressure", type: "number", required: true, unit: null, options: null },
      { id: "b", label: "Checked on", type: "date", required: true, unit: null, options: null },
      { id: "c", label: "Grade", type: "choice", required: false, unit: null, options: ["A", "B", "C"] },
      { id: "d", label: "Remarks", type: "text", required: true, unit: null, options: null },
      { id: "e", label: "Sealed", type: "yes_no", required: true, unit: null, options: null },
      { id: "g", label: "Later type", type: "photo", required: false, unit: null, options: null },
    ];
    for (const variant of [0, 1, 2, 3, 7]) {
      const values = demoReadingValues(fields, variant, "2026-10-20");
      expect(accepted(fields, values)).toEqual({ ok: true, value: values });
      expect(values.b).toBe("2026-10-20");
    }
  });
});
