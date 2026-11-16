import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, Then, userId, When } from "./fixtures";
import { idOf, ids, pageOf, projectPath } from "./partner-access.steps";
import { myRecordId } from "./sites.steps";
import { myDecoy, setHiddenFields } from "./workers.steps";
import { pressAndWait } from "./workspaces.steps";

// Site visits (task 058, ADR-0008).

/** A calendar day `days` from today in UTC ("YYYY-MM-DD"); negative for days ago. */
function utcDay(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const visitsSection = (page: Page) => page.getByRole("region", { name: "Visits", exact: true });

/** Watches the page's next form posts, so "send the same … again" can repeat the last one as it was. */
function watchPosts(page: Page, state: { lastPost?: { url: string; headers: Record<string, string>; body: Buffer | null } }) {
  page.on("request", (request) => {
    if (request.method() === "POST") {
      state.lastPost = { url: request.url(), headers: request.headers(), body: request.postDataBuffer() };
    }
  });
}

When("I open the new visit page of {string}", async ({ page, state }, project: string) => {
  watchPosts(page, state);
  await page.goto(`/dashboard/projects/${await myRecordId(page, "project", project)}/visits/new`);
  await expect(page.getByRole("heading", { name: "Record a visit", level: 1 })).toBeVisible();
});

Then("the {string} field shows today's date", async ({ page }, label: string) => {
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(utcDay(0));
});

Then("the {string} box is checked", async ({ page }, label: string) => {
  await expect(page.getByLabel(label, { exact: true })).toBeChecked();
});

When("I uncheck {string}", async ({ page }, label: string) => {
  await page.getByLabel(label, { exact: true }).uncheck();
});

When("I fill in {string} with a date {int} days from now", async ({ page }, label: string, days: number) => {
  await page.getByLabel(label, { exact: true }).fill(utcDay(days));
});

When("I fill in {string} with a date {int} days ago", async ({ page }, label: string, days: number) => {
  await page.getByLabel(label, { exact: true }).fill(utcDay(-days));
});

Then("I see the heading of today's visit", async ({ page }) => {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText("Visit on");
  await expect(heading.locator(`time[datetime="${utcDay(0)}"]`)).toBeVisible();
});

/** A visit of mine written to the database, with me as the one who was there. */
Given(
  "{string} has a visit {int} days ago with the notes {string}",
  async ({ page }, project: string, days: number, notes: string) => {
    const me = await userId(page);
    const id = crypto.randomUUID();
    const db = getMaintenanceDb();
    await db.execute(
      sql`insert into site_visit (id, project_id, visited_on, notes, created_by)
          values (${id}, ${await myRecordId(page, "project", project)}, ${utcDay(-days)}, ${notes}, ${me})`,
    );
    await db.execute(sql`insert into site_visit_member (visit_id, user_id) values (${id}, ${me})`);
  },
);

/** The project page's Visits, as their links read (the notes' first line), newest first; "" for none. */
Then("the visits listed are {string}", async ({ page }, expected: string) => {
  const links = visitsSection(page).getByRole("listitem").getByRole("link");
  const want = expected ? expected.split(",").map((v) => v.trim()) : [];
  if (want.length === 0) {
    await expect(visitsSection(page)).toContainText("No visits yet.");
  }
  await expect(links).toHaveText(want);
});

When("I send the same visit form again", async ({ page, state }) => {
  expect(state.lastPost, "no visit form was sent").toBeDefined();
  const { url, headers, body } = state.lastPost!;
  const response = await page.request.post(url, { headers, data: body ?? undefined, maxRedirects: 0 });
  expect(response.status()).toBeLessThan(500);
});

async function visitId(projectId: string, notes: string) {
  const { rows } = await getMaintenanceDb().execute<{ id: string }>(
    sql`select id from site_visit where project_id = ${projectId} and notes = ${notes}`,
  );
  expect(rows, `no visit "${notes}"`).toHaveLength(1);
  return rows[0]!.id;
}

When("I open the visit {string} of {string}", async ({ page }, notes: string, project: string) => {
  const projectId = await myRecordId(page, "project", project);
  await page.goto(`/dashboard/projects/${projectId}/visits/${await visitId(projectId, notes)}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Visit on");
});

// --- The leak suite's two-partner workspace (partner-access.steps.ts) --------------------------------------

When("I open the new visit page of the project {string}", async ({ page, state }, project: string) => {
  watchPosts(page, state);
  await page.goto(`${projectPath(state, project)}/visits/new`);
  await expect(page.getByRole("heading", { name: "Record a visit", level: 1 })).toBeVisible();
});

/** The "Who was there" choices, in order. */
Then("the {string} boxes are {string}", async ({ page }, legend: string, names: string) => {
  const group = page.getByRole("group", { name: legend, exact: true });
  await expect(group.getByRole("checkbox")).toHaveCount(names.split(",").length);
  await expect(group.locator("label")).toHaveText(names.split(",").map((n) => n.trim()));
});

Then("the auditor sees no {string} link", async ({ people, state }, name: string) => {
  const auditor = await pageOf(state, people, "auditor");
  await expect(auditor.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(auditor.getByRole("link", { name, exact: true })).toHaveCount(0);
});

Given(
  "the admin recorded a visit to {string} with the notes {string}",
  async ({ state }, project: string, notes: string) => {
    const id = crypto.randomUUID();
    const db = getMaintenanceDb();
    await db.execute(
      sql`insert into site_visit (id, project_id, visited_on, notes, created_by)
          values (${id}, ${idOf(state, project)}, current_date, ${notes}, ${idOf(state, "Admin")})`,
    );
    await db.execute(sql`insert into site_visit_member (visit_id, user_id) values (${id}, ${idOf(state, "Admin")})`);
    Object.assign(ids(state), { [`${notes}:visit`]: id, [`${notes}:visit-project`]: idOf(state, project) });
  },
);

const visitPath = (state: Parameters<typeof idOf>[0], notes: string) =>
  `/dashboard/projects/${idOf(state, `${notes}:visit-project`)}/visits/${idOf(state, `${notes}:visit`)}`;

When("I open the visit {string} of the project {string}", async ({ page, state }, notes: string, project: string) => {
  expect(idOf(state, `${notes}:visit-project`)).toBe(idOf(state, project));
  await page.goto(visitPath(state, notes));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Visit on");
});

When("I open the address of the visit {string}", async ({ page, state }, notes: string) => {
  await page.goto(visitPath(state, notes));
});

// A worker has no delete form for someone else's visit, so they use the one of a visit in a workspace of their
// own, pointed at it: the server must refuse it on the author, not on the missing form.
When("I post the delete form of the visit {string}", async ({ page, state }, notes: string) => {
  const decoy = await myDecoy(state);
  await page.goto(`/dashboard/projects/${decoy.projectId}/visits/${decoy.visitId}`);
  await expect(page.getByRole("button", { name: "Delete visit" })).toBeVisible();
  await setHiddenFields(page, "Delete visit", {
    projectId: idOf(state, `${notes}:visit-project`),
    visitId: idOf(state, `${notes}:visit`),
  });
  await pressAndWait(page, "Delete visit");
});

Then("the admin sees the visit {string} on {string}", async ({ people, state }, notes: string, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(`${projectPath(state, project)}?tab=work`);
  await expect(visitsSection(admin)).toContainText(notes);
});

Then("the admin sees no visits on {string}", async ({ people, state }, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(`${projectPath(state, project)}?tab=work`);
  await expect(visitsSection(admin)).toContainText("No visits yet.");
});

When(
  "I record a visit on {string} with the project id of {string}",
  async ({ page, state }, project: string, other: string) => {
    state.replay = async (id) => {
      await page.goto(`${projectPath(state, project)}/visits/new`);
      await page.getByLabel("Notes", { exact: true }).fill("Sneaky");
      await setHiddenFields(page, "Save visit", { projectId: id });
      await pressAndWait(page, "Save visit");
    };
    await state.replay(idOf(state, other));
  },
);

When(
  "I record a visit on {string} with the person id of {string}",
  async ({ page, state }, project: string, person: string) => {
    state.replay = async (id) => {
      await page.goto(`${projectPath(state, project)}/visits/new`);
      await page.getByLabel("Notes", { exact: true }).fill("Sneaky");
      await page.getByRole("group", { name: "Who was there", exact: true }).evaluate((group, value) => {
        const box = group.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        box.value = value;
        box.checked = true;
      }, id);
      await pressAndWait(page, "Save visit");
    };
    await state.replay(idOf(state, person));
  },
);


When(
  "I record a visit on {string} with the visit id of {string}",
  async ({ page, state }, project: string, notes: string) => {
    await page.goto(`${projectPath(state, project)}/visits/new`);
    await page.getByLabel("Notes", { exact: true }).fill("Sneaky");
    await setHiddenFields(page, "Save visit", { visitId: idOf(state, `${notes}:visit`) });
    await pressAndWait(page, "Save visit");
  },
);
