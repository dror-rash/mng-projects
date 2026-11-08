import { getMaintenanceDb } from "@repo/db/maintenance";
import { describe, expect, it } from "vitest";

import { isLocalServer } from "@/features/demo/local-reset";

import { readServerFacts } from "./server-facts";

// The server check of reset:local (task 080) on the local database in DATABASE_URL: it reads facts only.

describe("the reset's server check", () => {
  it("finds no Cloud SQL markers on the local database, and allows the reset", async () => {
    const facts = await readServerFacts(getMaintenanceDb());
    expect(facts).toEqual({ cloudSqlRole: false, cloudSqlSettings: false });
    expect(isLocalServer(facts)).toEqual({ local: true });
  });
});
