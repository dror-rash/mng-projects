import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, type ScenarioState, Then, userId, When } from "./fixtures";
import { idOf, pageOf, projectPath } from "./partner-access.steps";
import { myRecordId } from "./sites.steps";
import { pressAndWait } from "./workspaces.steps";

// Project stages (task 101, ADR-0012).

/** The stored value of a stage label ("In work" -> "in_work"), as ADR-0012 names them. */
const stageValue = (label: string) => label.trim().toLowerCase().replace(/\s+/g, "_");

/** A day in UTC ("YYYY-MM-DD"), `daysAgo` before today. */
const utcDay = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A project this scenario wrote (the leak workspace), else one of mine by its name. */
async function projectId(page: Page, state: ScenarioState, name: string) {
  return state.ids?.[name] ?? myRecordId(page, "project", name);
}

// A stage set in the database, as the stage form would have set it today: the project's stage and its history row.
Given("the project {string} is at the stage {string}", async ({ page, state }, project: string, stage: string) => {
  const db = getMaintenanceDb();
  const id = await projectId(page, state, project);
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
// Today or yesterday in UTC, so a scenario that runs across midnight UTC still passes.
Then("the project shows {string} since today", async ({ page }, stage: string) => {
  const line = page
    .getByRole("main")
    .locator(`:has(> time[datetime="${utcDay()}"]), :has(> time[datetime="${utcDay(1)}"])`)
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

// Stage checklists and "whose move" (task 120, ADR-0014). The "Next step" section lists the current stage's
// items, one list item each; whoever can change the project has a toggle button (`aria-pressed`) in each.

/** The checklist's item keys by their English text (task 120's table), for the rows a Given writes. */
const CHECKLIST_KEYS: Record<string, string> = {
  "Customer and site details recorded": "inquiry.details_recorded",
  "Inquiry logged in the communications log": "inquiry.logged",
  "Materials and labour costed": "quote.costed",
  "Quote sent to the customer": "quote.sent",
  "Customer accepted the quote": "quote.accepted",
  "Work order from an authorised person at the customer": "ordered.work_order",
  "Payment terms agreed": "ordered.payment_terms",
  "Work date set": "scheduled.date_set",
  "Crew assigned": "scheduled.crew_assigned",
  "Customer confirmed the date": "scheduled.customer_confirmed",
  "Site visits done": "in_work.visits_done",
  "Materials from suppliers reported on the project": "in_work.materials_reported",
  "Field reports handed over to the office": "in_work.reports_handed_over",
  "Report prepared in the office": "reporting.prepared",
  "Report sent to the customer": "reporting.sent",
  "Customer confirmed receiving the report": "reporting.received",
  "Bill or invoice prepared": "billing.prepared",
  "Sent to the customer": "billing.sent",
  "Customer confirmed receipt": "billing.received",
  "Work-completion report prepared and sent": "closed.completion_report",
};

// Named by its heading, "Next step" or, in Hebrew, "הצעד הבא" (task 120).
const nextStep = (page: Page) => page.getByRole("region", { name: /^(Next step|הצעד הבא)$/ });

/** The checklist item that starts with `label` (its party tag and who ticked it follow). */
const checklistItem = (page: Page, label: string) =>
  nextStep(page)
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^\\s*${escape(label)}`) });

const tickButton = (page: Page, label: string) => checklistItem(page, label).getByRole("button");

async function toggle(page: Page, label: string, from: "true" | "false") {
  const button = tickButton(page, label);
  await expect(button).toHaveAttribute("aria-pressed", from);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", from === "true" ? "false" : "true");
}

When("I tick {string}", async ({ page }, label: string) => {
  await toggle(page, label, "false");
});

When("I untick {string}", async ({ page }, label: string) => {
  await toggle(page, label, "true");
});

Then("the checklist items are {string}", async ({ page }, labels: string) => {
  await expect(nextStep(page).getByRole("listitem")).toHaveText(
    labels.split(",").map((label) => new RegExp(`^\\s*${escape(label.trim())}`)),
  );
});

Then("{string} is ticked by me today", async ({ page }, label: string) => {
  const [me] = (await getMaintenanceDb().execute<{ name: string }>(sql`select name from "user" where id = ${await userId(page)}`)).rows;
  const item = checklistItem(page, label);
  await expect(item.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  await expect(item).toContainText(`${me!.name},`);
  await expect(item.locator(`time[datetime="${utcDay()}"], time[datetime="${utcDay(1)}"]`)).toHaveCount(1);
});

Then("{string} is not ticked", async ({ page }, label: string) => {
  const item = checklistItem(page, label);
  await expect(item.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  await expect(item.locator("time")).toHaveCount(0);
});

/** The checklist is shown, and none of its items has a button. */
async function expectNoTickButtons(page: Page) {
  await expect(nextStep(page).getByRole("listitem").first()).toBeVisible();
  await expect(nextStep(page).getByRole("listitem").getByRole("button")).toHaveCount(0);
}

Then("I can't tick the checklist", async ({ page }) => {
  await expectNoTickButtons(page);
});

Then("the auditor can't tick the checklist", async ({ people, state }) => {
  await expectNoTickButtons(await pageOf(state, people, "auditor"));
});

// A tick as the item's button would write it, by an admin of the project's workspace: the leak workspace's
// admin, else me (my own projects' workspace is mine).
Given("the checklist item {string} of {string} is ticked", async ({ page, state }, label: string, project: string) => {
  const key = CHECKLIST_KEYS[label];
  expect(key, `no checklist item "${label}"`).toBeDefined();
  const id = await projectId(page, state, project);
  const by = state.ids?.Admin ?? (await userId(page));
  await getMaintenanceDb().execute(
    sql`insert into project_checklist_tick (project_id, item, ticked_by) values (${id}, ${key}, ${by})`,
  );
});

// A tampered form: the item's form on my own project's page (NW Site, at the same stage), its hidden project id
// set to the other partner's project (`state.replay` posts it again with another id).
When("I post a tick of {string} on {string}", async ({ page, state }, label: string, project: string) => {
  state.replay = async (id) => {
    await page.goto(projectPath(state, "NW Site"));
    const button = tickButton(page, label);
    await expect(button).toBeVisible();
    await button
      .locator("xpath=ancestor::form[1]")
      .locator('input[name="projectId"]')
      .evaluate((input, value) => {
        (input as HTMLInputElement).value = value;
      }, id);
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), button.click()]);
  };
  await state.replay(idOf(state, project));
});
