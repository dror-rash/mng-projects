import { expect, type Page } from "@playwright/test";

import { addFile, fileOf } from "./attachments.steps";
import { Given, type People, type ScenarioState, signUp, Then, When } from "./fixtures";
import { openReadingForm, saveReading } from "./readings.steps";
import { taskCard, taskInColumn } from "./project-tasks.steps";
import { pressAndWait } from "./workspaces.steps";

// The POC flow (task 069): an admin ("I"), a worker and a partner user, each a new account in their own browser.
// The scenario also runs against the deployed preview with only BASE_URL, so every step here goes through the
// app's pages and Better Auth's API: no database or storage access. Sign-ups are paced there (fixtures.ts).

type Role = "worker" | "partner user";

/** The person with this role in the scenario, once they joined. */
function person(state: ScenarioState, role: Role) {
  const entry = state.roles?.[role];
  expect(entry, `no ${role} in this scenario yet`).toBeDefined();
  return entry!;
}

/** Signs up a new person named `name` (paced), opens the kept invite link and joins the workspace. */
async function joinWithInviteLink(people: People, state: ScenarioState, role: Role, name: string) {
  expect(state.inviteLink, "no invite link was created").toBeDefined();
  const page = await people.newPerson();
  await signUp(page, name);
  await page.goto(state.inviteLink!);
  await pressAndWait(page, "Join workspace");
  await expect(page).toHaveURL(/\/dashboard$/);
  state.roles = { ...state.roles, [role]: { page } };
}

/** From All projects, follows the project's link; keeps its address. */
async function openProject(page: Page, name: string) {
  await page.goto("/dashboard/projects");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname;
}

/** Text the page shows, not values sitting in form fields (like "I see the text"). */
const shown = (page: Page, text: string) => page.getByText(text).and(page.locator(":not(textarea):not(input):not(option)")).first();

for (const role of ["worker", "partner user"] as const) {
  Given(`the ${role} {string} joins with the invite link`, async ({ people, state }, name: string) => {
    await joinWithInviteLink(people, state, role, name);
  });

  When(`the ${role} opens the {string} project`, async ({ state }, name: string) => {
    const entry = person(state, role);
    entry.projectPath = await openProject(entry.page, name);
  });

  Then(`the ${role} sees the text {string}`, async ({ state }, text: string) => {
    await expect(shown(person(state, role).page, text)).toBeVisible();
  });
}

// --- The worker, on site ---------------------------------------------------------------------------------------

When("the worker records a visit with the notes {string}", async ({ state }, notes: string) => {
  const worker = person(state, "worker");
  expect(worker.projectPath, "the worker hasn't opened a project").toBeDefined();
  await worker.page.goto(worker.projectPath!);
  await worker.page.getByRole("link", { name: "Record a visit", exact: true }).click();
  await expect(worker.page.getByRole("heading", { name: "Record a visit", level: 1 })).toBeVisible();
  await worker.page.getByLabel("Notes", { exact: true }).fill(notes);
  await pressAndWait(worker.page, "Save visit");
  await expect(worker.page.getByRole("heading", { level: 1 })).toContainText("Visit on");
  await expect(worker.page).toHaveURL(/\/dashboard\/projects\/[^/]+\/visits\/[^/]+$/);
  worker.visitPath = new URL(worker.page.url()).pathname;
});

When("the worker adds the photo {string} to the visit", async ({ state }, name: string) => {
  const worker = person(state, "worker");
  expect(worker.visitPath, "the worker hasn't recorded a visit").toBeDefined();
  await worker.page.goto(worker.visitPath!);
  await expect(worker.page.getByRole("heading", { level: 1 })).toContainText("Visit on");
  await addFile(worker.page, "Add photos", fileOf(name));
  await expect(
    worker.page.getByRole("region", { name: "Photos and files", exact: true }).getByRole("img", { name, exact: true }),
  ).toBeVisible();
});

When(
  "the worker fills in the {string} reading on the visit with {string} as {string}",
  async ({ state }, form: string, label: string, value: string) => {
    const worker = person(state, "worker");
    expect(worker.visitPath, "the worker hasn't recorded a visit").toBeDefined();
    await openReadingForm(worker.page, worker.visitPath!, form);
    await worker.page.getByLabel(label).fill(value);
    await saveReading(worker.page, form);
  },
);

When("the worker moves the task {string} to {string}", async ({ state }, title: string, status: string) => {
  const worker = person(state, "worker");
  expect(worker.projectPath, "the worker hasn't opened a project").toBeDefined();
  await worker.page.goto(worker.projectPath!);
  await taskCard(worker.page, title).getByRole("button", { name: `Move to ${status}` }).click();
  // Wait for the save to land, so a following navigation can't cancel it.
  await expect(taskInColumn(worker.page, title, status)).toBeVisible();
});

// --- The partner user ------------------------------------------------------------------------------------------

When("the partner user follows the {string} link", async ({ state }, name: string) => {
  const { page } = person(state, "partner user");
  const link = page.getByRole("link", { name, exact: true });
  const href = await link.getAttribute("href");
  await link.click();
  if (href?.startsWith("/")) await expect(page).toHaveURL((url) => url.pathname === href.split("?")[0]);
});

Then("the partner user sees the heading {string}", async ({ state }, text: string) => {
  const { page } = person(state, "partner user");
  await expect(page.getByRole("heading", { name: text }).filter({ visible: true }).first()).toBeVisible();
});

/** All projects' table: the project names are its row headers (like "the projects shown are"). */
Then("the partner user's projects are {string}", async ({ state }, names: string) => {
  const { page } = person(state, "partner user");
  await page.goto("/dashboard/projects");
  await expect(page.getByRole("table", { name: "Projects" }).getByRole("rowheader")).toHaveText(names.split(",").map((n) => n.trim()));
});

Then("the partner user's page shows none of {string}", async ({ state }, texts: string) => {
  const { page } = person(state, "partner user");
  await expect(page.getByRole("main")).toBeVisible();
  for (const text of texts.split(",").map((t) => t.trim())) {
    await expect(page.locator("body")).not.toContainText(text);
  }
});

/** I open the project from All projects; the partner user opens the same address (like the teammate's step). */
Then("the partner user can't open the {string} project", async ({ page, state }, name: string) => {
  const address = await openProject(page, name);
  const partner = person(state, "partner user").page;
  await partner.goto(address);
  await expect(partner.getByText("Project not found")).toBeVisible();
  await expect(partner.getByRole("heading", { name, level: 1 })).toHaveCount(0);
});
