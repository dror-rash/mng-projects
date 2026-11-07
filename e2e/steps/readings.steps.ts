import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, type ScenarioState, signUp, Then, userId, When } from "./fixtures";
import { buildForm, fieldOf, setHiddenFields } from "./form-templates.steps";
import { idOf, ids, pageOf, projectPath } from "./partner-access.steps";
import { insertCustomerWithSite } from "./project-form";
import { createWorkspace, pressAndWait } from "./workspaces.steps";

// Readings (task 061, ADR-0008): a published reading form filled on a visit. Forms are built through task
// 060's pages (form-templates.steps.ts); readings are always filled through the pages, from the visit's
// "Add a reading" link. Ids read through the maintenance connection are reads only.

const readingsSection = (page: Page) => page.getByRole("region", { name: "Readings", exact: true });

const names = (text: string) => text.split(",").map((t) => t.trim());

/** A visit of mine (the Background's: I was there and wrote it), by its notes: its page's address. */
async function myVisitPath(page: Page, notes: string) {
  const { rows } = await getMaintenanceDb().execute<{ id: string; project_id: string }>(
    sql`select id, project_id from site_visit where notes = ${notes} and created_by = ${await userId(page)}`,
  );
  expect(rows, `no visit "${notes}" of mine`).toHaveLength(1);
  return `/dashboard/projects/${rows[0]!.project_id}/visits/${rows[0]!.id}`;
}

/** A visit of the leak suite's workspace (site-visits.steps.ts wrote it), by its notes. */
const visitPath = (state: ScenarioState, notes: string) =>
  `/dashboard/projects/${idOf(state, `${notes}:visit-project`)}/visits/${idOf(state, `${notes}:visit`)}`;

/** A visit by its notes: the leak suite's when a step wrote it there, else mine (the Background's). */
const anyVisitPath = async (page: Page, state: ScenarioState, notes: string) =>
  state.ids?.[`${notes}:visit`] ? visitPath(state, notes) : myVisitPath(page, notes);

/** The id of the (one) version of a form this scenario built: no page shows it, so it is read (only read). */
async function versionOf(state: ScenarioState, form: string) {
  const { rows } = await getMaintenanceDb().execute<{ id: string }>(
    sql`select id from form_template_version where template_id = ${idOf(state, form)}`,
  );
  expect(rows, `no version of "${form}"`).toHaveLength(1);
  return rows[0]!.id;
}

/** Opens the visit's page and waits for it. */
async function openVisit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Visit on");
}

/** From the visit's page: "Add a reading", then the form's link; waits for its "Save reading". */
export async function openReadingForm(page: Page, path: string, form: string) {
  await openVisit(page, path);
  const add = page.getByRole("link", { name: "Add a reading", exact: true });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole("heading", { name: "Add a reading", level: 1 })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: form, exact: true }).click();
  await expect(page.getByRole("button", { name: "Save reading", exact: true })).toBeVisible();
}

/** Saves the reading form and waits for the reading's page (its heading, the form's name); returns its id. */
export async function saveReading(page: Page, form: string) {
  await pressAndWait(page, "Save reading");
  await expect(page.getByRole("heading", { name: form, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/readings\/[^/?#]+$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Watches the page's next form posts, so "send the same reading form again" can repeat the last one as it was. */
function watchPosts(page: Page, state: ScenarioState) {
  page.on("request", (request) => {
    if (request.method() === "POST") {
      state.lastPost = { url: request.url(), headers: request.headers(), body: request.postDataBuffer() };
    }
  });
}

// --- My own workspace (the Background) ---------------------------------------------------------------------

When("I open the {string} reading form on the visit {string}", async ({ page, state }, form: string, notes: string) => {
  watchPosts(page, state);
  await openReadingForm(page, await anyVisitPath(page, state, notes), form);
});

/** A Yes/no field: its radios are grouped under the field's label. */
When("I choose {string} for {string}", async ({ page }, option: string, label: string) => {
  const group = page.getByRole("radiogroup", { name: label, exact: true }).or(page.getByRole("group", { name: label, exact: true }));
  await group.getByRole("radio", { name: option, exact: true }).check();
});

/** The project page's Readings, one list item each, newest first; "" for none. */
Then("the readings listed are {string}", async ({ page }, expected: string) => {
  const items = readingsSection(page).getByRole("listitem");
  const want = expected ? names(expected) : [];
  if (want.length === 0) await expect(readingsSection(page)).toContainText("No readings yet.");
  await expect(items).toHaveCount(want.length);
  for (const [i, name] of want.entries()) {
    await expect(items.nth(i).getByRole("link")).toContainText(name);
  }
});

/** The "Add a reading" page's forms: one list item each, its link to `?form=<form id>`. */
Then("the forms offered are {string}", async ({ page }, expected: string) => {
  await expect(page.getByRole("heading", { name: "Add a reading", level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem").getByRole("link")).toHaveText(names(expected));
});

Given(
  "I filled in the reading {string} on the visit {string} with {string} as {string}",
  async ({ page }, form: string, notes: string, label: string, value: string) => {
    await openReadingForm(page, await myVisitPath(page, notes), form);
    await page.getByLabel(label).fill(value);
    await saveReading(page, form);
  },
);

When("I send the same reading form again", async ({ page, state }) => {
  expect(state.lastPost, "no reading form was sent").toBeDefined();
  const { url, headers, body } = state.lastPost!;
  const response = await page.request.post(url, { headers, data: body ?? undefined, maxRedirects: 0 });
  expect(response.status()).toBeLessThan(500);
});

// --- The leak suite's two-partner workspace (partner-access.steps.ts) --------------------------------------

When("the auditor opens the visit {string} of the project {string}", async ({ people, state }, notes: string, project: string) => {
  expect(idOf(state, `${notes}:visit-project`)).toBe(idOf(state, project));
  await openVisit(await pageOf(state, people, "auditor"), visitPath(state, notes));
});

/** The admin fills the form's (one, Number) field on the visit; the reading's id is kept by the visit's notes. */
Given("the admin filled in the reading {string} on the visit {string}", async ({ people, state }, form: string, notes: string) => {
  const admin = await pageOf(state, people, "admin");
  await openReadingForm(admin, visitPath(state, notes), form);
  await admin.getByLabel(fieldOf(state, form), { exact: true }).fill("230");
  ids(state)[`${notes}:reading`] = await saveReading(admin, form);
});

When("I open the address of the reading on the visit {string}", async ({ page, state }, notes: string) => {
  state.replay = async (id) => {
    await page.goto(`${visitPath(state, notes)}/readings/${id}`);
  };
  await state.replay(idOf(state, `${notes}:reading`));
});

/** Fills the form on the visit `notes` and posts it with the hidden field `name` set to the id `replay` gets. */
async function postReadingWith(page: Page, state: ScenarioState, notes: string, form: string, name: string, id: string) {
  const path = await anyVisitPath(page, state, notes);
  state.replay = async (value) => {
    await openReadingForm(page, path, form);
    await page.getByLabel(fieldOf(state, form), { exact: true }).fill("231");
    await setHiddenFields(page, "Save reading", { [name]: value });
    await pressAndWait(page, "Save reading");
  };
  await state.replay(id);
}

When(
  "I add the reading {string} on the visit {string} with the visit id of {string}",
  async ({ page, state }, form: string, notes: string, other: string) => {
    await postReadingWith(page, state, notes, form, "visitId", idOf(state, `${other}:visit`));
  },
);

When(
  "I add the reading {string} on the visit {string} with the form {string}",
  async ({ page, state }, form: string, notes: string, other: string) => {
    await postReadingWith(page, state, notes, form, "versionId", await versionOf(state, other));
  },
);

Then("the admin sees no readings on {string}", async ({ people, state }, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(projectPath(state, project));
  await expect(admin.getByRole("heading", { name: project, level: 1 })).toBeVisible();
  await expect(readingsSection(admin)).toContainText("No readings yet.");
  await expect(readingsSection(admin).getByRole("listitem")).toHaveCount(0);
});

// --- The rest of the leak suite (the access audit) -----------------------------------------------------------

/** Another person, in a workspace of their own (made on their first visit), builds and publishes the form. */
Given(
  "another user has a published reading form {string} with the field {string}",
  async ({ people, state }, name: string, field: string) => {
    const other = await people.newPerson();
    await signUp(other, "Other User");
    await buildForm(other, state, name, field);
  },
);

When("I open the Add a reading page of the visit {string}", async ({ page, state }, notes: string) => {
  await page.goto(`${await anyVisitPath(page, state, notes)}/readings/new`);
});

When(
  "I open the Add a reading page of the visit {string} with the form {string}",
  async ({ page, state }, notes: string, form: string) => {
    await page.goto(`${await anyVisitPath(page, state, notes)}/readings/new?form=${idOf(state, form)}`);
  },
);

When(
  "I add the reading {string} on the visit {string} with the id of the reading on the visit {string}",
  async ({ page, state }, form: string, notes: string, other: string) => {
    await postReadingWith(page, state, notes, form, "readingId", idOf(state, `${other}:reading`));
  },
);

/**
 * The auditor has no reading form on the leak workspace's visits, so they post the one of a decoy: a workspace
 * of their own (where they are an admin) with a published form and a visit, its hidden fields pointed at the
 * project, the visit and the form's version. The server must refuse it on the role, not on the missing form.
 */
When(
  "the auditor posts the {string} reading form on the visit {string}",
  async ({ people, state }, form: string, notes: string) => {
    const auditor = await pageOf(state, people, "auditor");
    await createWorkspace(auditor, "Auditor's own");
    await buildForm(auditor, state, "Decoy check", "Decoy reading");
    const { rows } = await getMaintenanceDb().execute<{ id: string }>(
      sql`select workspace_id as id from form_template where id = ${idOf(state, "Decoy check")}`,
    );
    const workspaceId = rows[0]!.id;
    const { organizationId, siteId } = await insertCustomerWithSite(workspaceId, "Decoy client");
    const projectId = crypto.randomUUID();
    const visitId = crypto.randomUUID();
    const db = getMaintenanceDb();
    await db.execute(
      sql`insert into project (id, name, workspace_id, organization_id, site_id)
          values (${projectId}, 'Decoy', ${workspaceId}, ${organizationId}, ${siteId})`,
    );
    await db.execute(
      sql`insert into site_visit (id, project_id, visited_on, notes, created_by)
          values (${visitId}, ${projectId}, current_date, 'Decoy visit', ${idOf(state, "Auditor")})`,
    );
    await auditor.goto(`/dashboard/projects/${projectId}/visits/${visitId}/readings/new?form=${idOf(state, "Decoy check")}`);
    await expect(auditor.getByRole("button", { name: "Save reading", exact: true })).toBeVisible();
    await auditor.getByLabel(fieldOf(state, "Decoy check"), { exact: true }).fill("231");
    await setHiddenFields(auditor, "Save reading", {
      projectId: idOf(state, `${notes}:visit-project`),
      visitId: idOf(state, `${notes}:visit`),
      versionId: await versionOf(state, form),
    });
    await pressAndWait(auditor, "Save reading");
  },
);
