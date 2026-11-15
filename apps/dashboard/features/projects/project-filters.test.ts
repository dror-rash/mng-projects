import { describe, expect, it } from "vitest";

import { filterParams, filterProjects, parseProjectFilters } from "./project-filters";

const customers = ["acme", "globex"];

describe("parseProjectFilters", () => {
  it("shows everything as a table when there are no params", () => {
    expect(parseProjectFilters({}, customers)).toEqual({ overdue: false, view: "table" });
  });

  it("reads every filter and the view", () => {
    expect(
      parseProjectFilters({ customer: "acme", status: "done", stage: "in_work", overdue: "1", q: "  web  ", view: "tiles" }, customers),
    ).toEqual({ customer: "acme", status: "done", stage: "in_work", overdue: true, q: "web", view: "tiles" });
  });

  it("ignores an old link to projects without a customer, which no longer exist (task 071)", () => {
    expect(parseProjectFilters({ customer: "none" }, customers)).toEqual({ overdue: false, view: "table" });
  });

  it("ignores a customer that isn't one of the workspace's, an unknown status or stage and an unknown view", () => {
    expect(parseProjectFilters({ customer: "someone-else", status: "archived", stage: "In work", view: "grid" }, customers)).toEqual({
      overdue: false,
      view: "table",
    });
  });

  it("uses the first value when a param repeats", () => {
    expect(parseProjectFilters({ status: ["done", "no_tasks"] }, customers).status).toBe("done");
  });
});

describe("filterParams", () => {
  it("leaves out the defaults, so a plain link stays plain", () => {
    expect(filterParams({ overdue: false, view: "table" })).toEqual({});
  });

  it("writes every set filter", () => {
    expect(filterParams({ customer: "acme", status: "done", stage: "quote", overdue: true, q: "web", view: "tiles" })).toEqual({
      customer: "acme",
      status: "done",
      stage: "quote",
      overdue: "1",
      q: "web",
      view: "tiles",
    });
  });
});

describe("filterProjects", () => {
  const projects = [
    { name: "Website Redesign", organizationId: "acme", status: "in_progress" as const, stage: "quote", overdue: 0 },
    { name: "Internal Ops", organizationId: "acme", status: "not_started" as const, stage: "made_up", overdue: 2 },
    { name: "Mobile App", organizationId: "globex", status: "done" as const, stage: "quote", overdue: 0 },
  ];
  const names = (filters: Parameters<typeof filterProjects>[1]) => filterProjects(projects, filters).map((p) => p.name);

  it("keeps everything without filters, in order", () => {
    expect(names({ overdue: false, view: "table" })).toEqual(["Website Redesign", "Internal Ops", "Mobile App"]);
  });

  it("filters by customer", () => {
    expect(names({ customer: "acme", overdue: false, view: "table" })).toEqual(["Website Redesign", "Internal Ops"]);
    expect(names({ customer: "globex", overdue: false, view: "table" })).toEqual(["Mobile App"]);
  });

  it("filters by status", () => {
    expect(names({ status: "done", overdue: false, view: "table" })).toEqual(["Mobile App"]);
  });

  it("filters by stage, an unknown stored stage counting as Inquiry (task 101)", () => {
    expect(names({ stage: "quote", overdue: false, view: "table" })).toEqual(["Website Redesign", "Mobile App"]);
    expect(names({ stage: "inquiry", overdue: false, view: "table" })).toEqual(["Internal Ops"]);
    expect(names({ stage: "closed", overdue: false, view: "table" })).toEqual([]);
  });

  it("keeps only projects with overdue tasks", () => {
    expect(names({ overdue: true, view: "table" })).toEqual(["Internal Ops"]);
  });

  it("searches names without caring about case", () => {
    expect(names({ q: "WEB", overdue: false, view: "table" })).toEqual(["Website Redesign"]);
  });

  it("combines filters", () => {
    expect(names({ q: "o", customer: "acme", overdue: true, view: "table" })).toEqual(["Internal Ops"]);
    expect(names({ q: "web", customer: "globex", overdue: false, view: "table" })).toEqual([]);
  });
});
