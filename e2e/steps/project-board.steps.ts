import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, type ScenarioState, Then } from "./fixtures";
import { myRecordId } from "./sites.steps";

// The stage board (task 123): All projects with a column per stage under its phase. Phases are level-2 headings
// in the page's main; each column is a region named by its stage and count ("Quote 2"); a card is a list item
// whose first link is the project.

/** The stored value of a stage label ("In work" -> "in_work"), as ADR-0012 names them. */
const stageValue = (label: string) => label.trim().toLowerCase().replace(/\s+/g, "_");

/** A project this scenario wrote (the leak workspace), else one of mine by its name. */
async function projectId(page: Page, state: ScenarioState, name: string) {
  return state.ids?.[name] ?? myRecordId(page, "project", name);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A stage set that many days ago (UTC), as the stage form would have set it then: the project's stage and its
// history row. The project and its earlier history rows (its first stage, from the new-project form) move back to
// before that, so the history stays in order and neither the creation nor an earlier change is the newer "since".
Given(
  "the project {string} has been at the stage {string} for {int} days",
  async ({ page, state }, project: string, stage: string, days: number) => {
    const db = getMaintenanceDb();
    const id = await projectId(page, state, project);
    // UTC ISO strings: node-postgres would send a Date in the runner's local time, which a `timestamp` keeps as is.
    const changedAt = new Date(Date.now() - days * 86_400_000).toISOString();
    const before = new Date(Date.parse(changedAt) - 60_000).toISOString();
    const [from] = (await db.execute<{ stage: string }>(sql`select stage from project where id = ${id}`)).rows;
    await db.execute(
      sql`update project set stage = ${stageValue(stage)}, created_at = least(created_at, ${before}) where id = ${id}`,
    );
    await db.execute(sql`update project_stage_change set changed_at = least(changed_at, ${before}) where project_id = ${id}`);
    await db.execute(
      sql`insert into project_stage_change (id, project_id, from_stage, to_stage, changed_at)
          values (${crypto.randomUUID()}, ${id}, ${from?.stage ?? null}, ${stageValue(stage)}, ${changedAt})`,
    );
  },
);

Then("the board's phases are {string}", async ({ page }, phases: string) => {
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(
    phases.split(",").map((p) => p.trim()),
  );
});

// An empty column says so, and its name carries its count ("Inquiry 0").
Then("the {string} column is empty", async ({ page }, column: string) => {
  const region = page.getByRole("region", { name: column });
  await expect(region).toHaveAccessibleName(new RegExp(`^\\s*${escape(column)}\\D*\\b0\\b\\D*$`));
  await expect(region).toContainText("No projects");
  await expect(region.getByRole("listitem")).toHaveCount(0);
});

Then("the {string} project card does not show {string}", async ({ page }, name: string, text: string) => {
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name }) });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText(text);
});

// A column's count is part of its name ("Ordered 1"), so a card a person can't see can't hide in the number.
Then("the {string} column's count is {int}", async ({ page }, column: string, count: number) => {
  await expect(page.getByRole("region", { name: column })).toHaveAccessibleName(
    new RegExp(`^\\s*${escape(column)}\\D*\\b${count}\\b\\D*$`),
  );
});
