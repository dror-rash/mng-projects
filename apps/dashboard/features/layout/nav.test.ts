import { describe, expect, it } from "vitest";

import { navFor } from "./nav";

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
