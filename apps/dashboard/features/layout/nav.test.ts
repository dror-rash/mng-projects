import { describe, expect, it } from "vitest";

import { currentNavItem, navFor } from "./nav";

const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).map((item) => item.labelKey);

describe("navFor", () => {
  it("gives admins Overview, All projects and Customers", () => {
    expect(labels("admin")).toEqual(["overview", "allProjects", "customers"]);
  });

  it("gives auditors Overview, All projects and Customers", () => {
    expect(labels("auditor")).toEqual(["overview", "allProjects", "customers"]);
  });

  it("gives partners Overview and All projects", () => {
    expect(labels("partner")).toEqual(["overview", "allProjects"]);
  });

  it("gives workers Overview and All projects", () => {
    expect(labels("worker")).toEqual(["overview", "allProjects"]);
  });

  it("links each item inside the dashboard zone", () => {
    expect(navFor("admin").map((item) => item.href)).toEqual(["/", "/projects", "/customers"]);
  });
});

describe("currentNavItem", () => {
  const items = navFor("admin");
  const current = (pathname: string) => currentNavItem(pathname, items)?.labelKey;

  it("marks Overview on the overview only", () => {
    expect(current("/")).toBe("overview");
  });

  it("marks All projects on the projects list", () => {
    expect(current("/projects")).toBe("allProjects");
  });

  it("marks All projects on a project, its tasks, visits and readings", () => {
    expect(current("/projects/new")).toBe("allProjects");
    expect(current("/projects/p1")).toBe("allProjects");
    expect(current("/projects/p1/tasks/t1")).toBe("allProjects");
    expect(current("/projects/p1/visits/v1/readings/r1")).toBe("allProjects");
  });

  it("marks Customers on the customers list and everything under it", () => {
    expect(current("/customers")).toBe("customers");
    expect(current("/customers/c1/contacts/k1/edit")).toBe("customers");
  });

  it("marks nothing on pages outside the menu", () => {
    for (const pathname of ["/my-tasks", "/forms", "/forms/f1", "/partners", "/deleted", "/sites/s1", "/workspace", "/workspaces"]) {
      expect(current(pathname)).toBeUndefined();
    }
  });

  it("does not take a path that only starts with an item's address", () => {
    expect(current("/projectsx")).toBeUndefined();
    expect(current("/customers-old")).toBeUndefined();
  });

  it("marks nothing for Customers when the menu has no Customers item", () => {
    expect(currentNavItem("/customers", navFor("partner"))).toBeUndefined();
  });
});
