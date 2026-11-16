import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, signUp, Then, userId, When } from "./fixtures";
import { idOf, ids, pageOf, projectPath } from "./partner-access.steps";
import { insertCustomerWithSite } from "./project-form";
import { pressAndWait } from "./workspaces.steps";

// Workers and crews (task 056, ADR-0008), in the leak suite's two-partner workspace (partner-access.steps.ts).

// The worker membership comes before any page is opened, so it is my only (and current) workspace.
Given("I am signed in as a worker", async ({ page, state }) => {
  await signUp(page, "Worker");
  const me = await userId(page);
  await getMaintenanceDb().execute(
    sql`insert into workspace_member (workspace_id, user_id, role) values (${idOf(state, "workspace")}, ${me}, 'worker')`,
  );
  Object.assign(ids(state), { me, Worker: me });
});

// Like the worker: a second auditor of the leak workspace (the workspace's own "the auditor" is someone else).
Given("I am signed in as an auditor", async ({ page, state }) => {
  await signUp(page, "Other Auditor");
  const me = await userId(page);
  await getMaintenanceDb().execute(
    sql`insert into workspace_member (workspace_id, user_id, role) values (${idOf(state, "workspace")}, ${me}, 'auditor')`,
  );
  ids(state).me = me;
});

Given("I am on the crew of {string}", async ({ state }, project: string) => {
  await getMaintenanceDb().execute(
    sql`insert into project_worker (project_id, user_id, workspace_id)
        values (${idOf(state, project)}, ${idOf(state, "me")}, ${idOf(state, "workspace")})`,
  );
});

When("the admin opens the {string} project page", async ({ people, state }, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(projectPath(state, project));
  await expect(admin.getByRole("heading", { name: project, level: 1 })).toBeVisible();
});

const crew = (page: Page) => page.getByRole("region", { name: "Crew", exact: true });

When("the admin adds {string} to the crew", async ({ people, state }, name: string) => {
  const admin = await pageOf(state, people, "admin");
  await crew(admin).getByLabel("Worker to add", { exact: true }).selectOption({ label: name });
  await pressAndWait(admin, "Add to crew");
  await expect(crew(admin).getByRole("button", { name: `Remove ${name}`, exact: true })).toBeVisible();
});

When("the admin removes {string} from the crew", async ({ people, state }, name: string) => {
  const admin = await pageOf(state, people, "admin");
  await pressAndWait(admin, `Remove ${name}`);
  await expect(crew(admin).getByRole("button", { name: `Remove ${name}`, exact: true })).toHaveCount(0);
});

Then("the admin sees the {string} section shows {string}", async ({ people, state }, section: string, text: string) => {
  const admin = await pageOf(state, people, "admin");
  await expect(admin.getByRole("region", { name: section, exact: true })).toContainText(text);
});

// What the admin's task form would save: the assignment itself is the admin's, tested in task-assignees.
Given("the task {string} is assigned to me by the admin", async ({ state }, task: string) => {
  await getMaintenanceDb().execute(sql`update task set assignee_id = ${idOf(state, "me")} where id = ${idOf(state, task)}`);
});

Then(
  "the auditor sees no {string} button and no {string} button",
  async ({ people, state }, first: string, second: string) => {
    const auditor = await pageOf(state, people, "auditor");
    // The page is there (its title and open tab), so the missing buttons aren't just not loaded yet. Not the crew's
    // "Worker": the Crew section is on the Work tab only (task 122), and the reports' check is on Reports.
    await expect(auditor.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(auditor.getByRole("navigation", { name: "Project sections" }).locator('[aria-current="page"]')).toBeVisible();
    await expect(auditor.getByRole("button", { name: first, exact: true })).toHaveCount(0);
    await expect(auditor.getByRole("button", { name: second, exact: true })).toHaveCount(0);
  },
);

// --- Tampered forms: a worker has no delete or project edit form, so they use the ones of a decoy project in
// a workspace of their own (where they are an admin), pointed at the crew project. The server must refuse
// it on the role, not on the missing form.

/** A workspace of mine with the project "Decoy", its task "Decoy task" and a visit of mine; returns their ids. */
export async function myDecoy(state: Parameters<typeof idOf>[0]) {
  const db = getMaintenanceDb();
  const workspaceId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  await db.execute(sql`insert into workspace (id, name) values (${workspaceId}, 'My own')`);
  await db.execute(sql`insert into workspace_member (workspace_id, user_id, role) values (${workspaceId}, ${idOf(state, "me")}, 'admin')`);
  const { organizationId, siteId } = await insertCustomerWithSite(workspaceId, "Decoy client");
  await db.execute(
    sql`insert into project (id, name, workspace_id, organization_id, site_id)
        values (${projectId}, 'Decoy', ${workspaceId}, ${organizationId}, ${siteId})`,
  );
  await db.execute(sql`insert into task (id, project_id, title) values (${taskId}, ${projectId}, 'Decoy task')`);
  const visitId = crypto.randomUUID();
  await db.execute(
    sql`insert into site_visit (id, project_id, visited_on, notes, created_by) values (${visitId}, ${projectId}, current_date, 'Decoy visit', ${idOf(state, "me")})`,
  );
  return { projectId, taskId, visitId };
}

/** Sets the hidden fields of the form with the button `button`. */
export async function setHiddenFields(page: Page, button: string, values: Record<string, string>) {
  await page.locator("form", { has: page.getByRole("button", { name: button }) }).evaluate((form, fields) => {
    for (const [name, value] of Object.entries(fields)) {
      form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = value;
    }
  }, values);
}

When("I post the delete form of the task {string}", async ({ page, state }, task: string) => {
  const decoy = await myDecoy(state);
  await page.goto(`/dashboard/projects/${decoy.projectId}/tasks/${decoy.taskId}`);
  await expect(page.getByRole("heading", { name: "Decoy task", level: 1 })).toBeVisible();
  await setHiddenFields(page, "Delete task", { projectId: idOf(state, `${task}:project`), taskId: idOf(state, task) });
  await pressAndWait(page, "Delete task");
});

When(
  "I post the edit form of the {string} project with the name {string}",
  async ({ page, state }, project: string, name: string) => {
    const decoy = await myDecoy(state);
    await page.goto(`/dashboard/projects/${decoy.projectId}/edit`);
    await page.getByLabel("Project name").fill(name);
    await setHiddenFields(page, "Save changes", { projectId: idOf(state, project) });
    await pressAndWait(page, "Save changes");
  },
);
