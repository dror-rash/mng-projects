import { expect, type Page } from "@playwright/test";
import { eq, schema } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, Then, When } from "./fixtures";
import { ids, idOf, pageOf, projectPath, shownText } from "./partner-access.steps";
import { chooseCustomerAndSite } from "./project-form";
import { expectAuditorSees, myRecordId } from "./sites.steps";
import { pressAndWait } from "./workspaces.steps";

// Cancel and copy (task 050), in the leak suite's two-partner workspace (partner-access.steps.ts).

// A project of the leak workspace, else one of mine by its name (task 124 cancels one of mine).
Given("the project {string} is canceled", async ({ page, state }, project: string) => {
  const id = state.ids?.[project] ?? (await myRecordId(page, "project", project));
  await getMaintenanceDb().update(schema.project).set({ lifecycle: "canceled" }).where(eq(schema.project.id, id));
});

Given("the task {string} is in progress and assigned to the admin", async ({ state }, task: string) => {
  await getMaintenanceDb()
    .update(schema.task)
    .set({ status: "in_progress", assigneeId: idOf(state, "Admin") })
    .where(eq(schema.task.id, idOf(state, task)));
});

/** Ends on the new project's page, and records its id under `name`. */
When(
  "the admin copies {string} to {string} owned by {string} for {string}",
  async ({ people, state }, source: string, name: string, owner: string, customer: string) => {
    const admin = await pageOf(state, people, "admin");
    await admin.goto(projectPath(state, source));
    await admin.getByRole("link", { name: "Copy to new project", exact: true }).click();
    await expect(admin.getByLabel("Project name")).toHaveValue(source);
    await chooseCustomerAndSite(admin, customer);
    await admin.getByLabel("Project name").fill(name);
    await admin.getByLabel("Owner", { exact: true }).selectOption({ label: owner });
    await pressAndWait(admin, "Copy project");
    await expect(admin.getByRole("heading", { name, level: 1 })).toBeVisible();
    ids(state)[name] = admin.url().split("/").pop()!;
  },
);

Then("the admin sees the project {string}, copied from {string}", async ({ people, state }, name: string, source: string) => {
  const admin = await pageOf(state, people, "admin");
  await expect(admin.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(admin.getByRole("main")).toContainText(`Copied from ${source}`);
  await expect(admin.getByRole("link", { name: source, exact: true })).toHaveAttribute("href", new RegExp(`${idOf(state, source)}$`));
});

Then("the admin sees the task {string} in the {string} column", async ({ people, state }, task: string, column: string) => {
  const admin = await pageOf(state, people, "admin");
  await expect(admin.getByRole("region", { name: column }).getByRole("listitem").filter({ hasText: task })).toBeVisible();
});

When("the admin opens the task {string} of {string}", async ({ people, state }, task: string, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(projectPath(state, project));
  await admin.getByRole("link", { name: task, exact: true }).click();
  await expect(admin.getByRole("heading", { name: task, level: 1 })).toBeVisible();
});

Then("the admin sees the text {string}", async ({ people, state }, text: string) => {
  await expect(shownText(await pageOf(state, people, "admin"), text)).toBeVisible();
});

Then("the admin sees the {string} row shows {string}", async ({ people, state }, project: string, text: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto("/dashboard/projects");
  const row = admin.getByRole("row").filter({ has: admin.getByRole("rowheader", { name: project, exact: true }) });
  await expect(row).toContainText(text);
});

When("the auditor opens the {string} project page", async ({ people, state }, project: string) => {
  const auditor = await pageOf(state, people, "auditor");
  await auditor.goto(projectPath(state, project));
  await expect(auditor.getByRole("heading", { name: project, level: 1 })).toBeVisible();
});

Then(
  "the auditor sees no {string} button and no {string} link",
  async ({ people, state }, button: string, link: string) => {
    const auditor = await pageOf(state, people, "auditor");
    await expect(auditor.getByRole("button", { name: button })).toHaveCount(0);
    await expect(auditor.getByRole("link", { name: link })).toHaveCount(0);
  },
);

When("the auditor opens the copy page of {string}", async ({ people, state }, project: string) => {
  await (await pageOf(state, people, "auditor")).goto(`${projectPath(state, project)}/copy`);
});

// Text on the auditor's page: a page title ("Project not found") or a row (a project on a site page, task 072).
Then("the auditor sees {string}", async ({ people, state }, text: string) => {
  await expectAuditorSees(people, state, text);
});

When("I open the copy page of {string}", async ({ page, state }, project: string) => {
  await page.goto(`${projectPath(state, project)}/copy`);
});

// --- Tampered forms: the real form, with one id changed (`state.replay` posts it again) ---------------------

/** Sets the hidden `name` field of the form with the button `button`. */
async function setHidden(page: Page, button: string, name: string, value: string) {
  await page
    .locator("form", { has: page.getByRole("button", { name: button }) })
    .locator(`input[name="${name}"]`)
    .evaluate((input, id) => {
      (input as HTMLInputElement).value = id;
    }, value);
}

When(
  "I copy the project {string} as {string} with the project id of {string}",
  async ({ page, state }, project: string, name: string, other: string) => {
    state.replay = async (id) => {
      await page.goto(`${projectPath(state, project)}/copy`);
      await page.getByLabel("Project name").fill(name);
      await setHidden(page, "Copy project", "sourceId", id);
      await pressAndWait(page, "Copy project");
    };
    await state.replay(idOf(state, other));
  },
);

When(
  "I cancel the project {string} with the project id of {string}",
  async ({ page, state }, project: string, other: string) => {
    state.replay = async (id) => {
      await page.goto(projectPath(state, project));
      await setHidden(page, "Cancel project", "projectId", id);
      await pressAndWait(page, "Cancel project");
    };
    await state.replay(idOf(state, other));
  },
);

When("I open the edit page of {string}", async ({ page, state }, project: string) => {
  await page.goto(`${projectPath(state, project)}/edit`);
  await expect(page.getByLabel("Project name")).toBeVisible();
});

// The raw page, inline flight data included: props sent to client components must not carry the id either.
// After a client navigation the DOM has no inline flight data, so the document is also fetched afresh.
Then("the page source doesn't contain the id of {string}", async ({ page, state }, name: string) => {
  const id = idOf(state, name);
  expect(await page.content()).not.toContain(id);
  const response = await page.request.get(page.url());
  expect(response.ok()).toBeTruthy();
  // Not redirected (to the login page, say): the fetched document is the page itself.
  expect(response.url()).toBe(page.url());
  expect(await response.text()).not.toContain(id);
});
