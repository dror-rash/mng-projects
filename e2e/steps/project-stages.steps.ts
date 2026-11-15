import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, type ScenarioState, Then, When } from "./fixtures";
import { idOf, projectPath } from "./partner-access.steps";
import { myRecordId } from "./sites.steps";
import { pressAndWait } from "./workspaces.steps";

// Project stages (task 101, ADR-0012).

/** The stored value of a stage label ("In work" -> "in_work"), as ADR-0012 names them. */
const stageValue = (label: string) => label.trim().toLowerCase().replace(/\s+/g, "_");

/** Today in UTC ("YYYY-MM-DD"). */
const todayUtc = () => new Date().toISOString().slice(0, 10);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A project this scenario wrote (the leak workspace), else one of mine by its name. */
async function projectId(page: Page, state: ScenarioState, name: string) {
  return state.ids?.[name] ?? myRecordId(page, "project", name);
}

// A stage set in the database, as the stage form would have set it today: the project's stage and its history row.
Given("the project {string} is at the stage {string}", async ({ page, state }, project: string, stage: string) => {
  const db = getMaintenanceDb();
  const id = await projectId(page, state, project);
  const { rows } = await db.execute<{ found: number }>(
    sql`select 1 as found from information_schema.columns where table_name = 'project' and column_name = 'stage'`,
  );
  expect(rows, "the project table has no stage column (task 101 not built)").toHaveLength(1);
  const [from] = (await db.execute<{ stage: string }>(sql`select stage from project where id = ${id}`)).rows;
  await db.execute(sql`update project set stage = ${stageValue(stage)} where id = ${id}`);
  await db.execute(
    sql`insert into project_stage_change (id, project_id, from_stage, to_stage, changed_at)
        values (${crypto.randomUUID()}, ${id}, ${from?.stage ?? null}, ${stageValue(stage)}, now())`,
  );
});

When("I change the stage to {string}", async ({ page }, stage: string) => {
  await page.getByLabel("Stage", { exact: true }).selectOption({ label: stage });
  await pressAndWait(page, "Change stage");
});

// "<Stage> since <date>", the date a <time datetime="YYYY-MM-DD"> like the other calendar days the pages show.
Then("the project shows {string} since today", async ({ page }, stage: string) => {
  const line = page
    .getByRole("main")
    .locator(`:has(> time[datetime="${todayUtc()}"])`)
    .filter({ hasText: new RegExp(`^\\s*${escape(stage)} since\\b`) });
  await expect(line.first()).toBeVisible();
});

Then("I see no {string} button", async ({ page }, name: string) => {
  // Wait for the page, then look for the button.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
});

// A tampered form: my own project's stage form (NW Site), its hidden project id set to the other partner's
// project (`state.replay` posts it again with another id).
When("I post a stage change of {string} to {string}", async ({ page, state }, project: string, stage: string) => {
  state.replay = async (id) => {
    await page.goto(projectPath(state, "NW Site"));
    await page.getByLabel("Stage", { exact: true }).selectOption({ label: stage });
    await page
      .locator("form", { has: page.getByRole("button", { name: "Change stage" }) })
      .locator('input[name="projectId"]')
      .evaluate((input, value) => {
        (input as HTMLInputElement).value = value;
      }, id);
    await pressAndWait(page, "Change stage");
  };
  await state.replay(idOf(state, project));
});
