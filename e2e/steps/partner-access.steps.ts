import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test";
import { eq, schema } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { type Account, authPost, Given, type People, SIGN_IN_PATH, SIGN_UP_PATH, type ScenarioState, signUp, Then, userId, When } from "./fixtures";
import { chooseCustomerAndSite, insertCustomerWithSite } from "./project-form";
import { pressAndWait } from "./workspaces.steps";

// The leak suite (task 049, ADR-0006). The two-partner workspace is written straight to the database
// through the maintenance connection (fast, and the same every run); every check goes through the app as
// a signed-in user: "I" am a user of Northwind, the admin and the auditor sign in when a step needs them.

/** Records are written a minute apart from a day ago, in step order, so "newest first" lists are predictable. */
let clock = Date.now();
function nextTime() {
  clock += 60_000;
  return new Date(clock);
}

export function ids(state: ScenarioState) {
  state.ids ??= {};
  return state.ids;
}

/** The id of a record this scenario wrote, by its name. */
export function idOf(state: ScenarioState, name: string) {
  const id = state.ids?.[name];
  expect(id, `no record named "${name}"`).toBeDefined();
  return id!;
}

export const projectPath = (state: ScenarioState, project: string) => `/dashboard/projects/${idOf(state, project)}`;
const taskPath = (state: ScenarioState, task: string) =>
  `/dashboard/projects/${idOf(state, `${task}:project`)}/tasks/${idOf(state, task)}`;

/** Signs up an account through the API without signing anyone in; returns it with the new user's id. */
async function newAccount(request: APIRequestContext, name: string) {
  const account: Account = { email: `${name.toLowerCase()}-${crypto.randomUUID()}@example.com`, password: "correct-horse-battery" };
  expect((await authPost(request, SIGN_UP_PATH, { name, ...account })).ok()).toBeTruthy();
  const [user] = await getMaintenanceDb().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, account.email));
  return { account, id: user!.id };
}

/** The page of the admin or the auditor, signed in on first use. */
export async function pageOf(state: ScenarioState, people: People, who: "admin" | "auditor") {
  const entry = state.accounts?.[who];
  expect(entry, `no ${who} in this scenario`).toBeDefined();
  if (!entry!.page) {
    const page = await people.newPerson();
    expect((await authPost(page.request, SIGN_IN_PATH, entry!.account)).ok()).toBeTruthy();
    entry!.page = page;
  }
  return entry!.page;
}

/** Adds an option with `value` to the select and chooses it: a tampered form, as a user could post it. */
export async function chooseValue(select: Locator, value: string) {
  await select.evaluate((element, id) => {
    const option = document.createElement("option");
    option.value = id;
    option.text = "Tampered";
    element.appendChild(option);
    (element as HTMLSelectElement).value = id;
  }, value);
}

/** Text the page shows, not values sitting in form fields or options. */
export function shownText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).and(page.locator(":not(textarea):not(input):not(option)")).first();
}

/** Opens a task's page and waits for it. */
async function openTask(page: Page, state: ScenarioState, task: string) {
  await page.goto(taskPath(state, task));
  await expect(page.getByRole("heading", { name: task, level: 1 })).toBeVisible();
}

async function insertCustomer(state: ScenarioState, name: string) {
  if (state.ids?.[name]) return state.ids[name];
  const id = crypto.randomUUID();
  await getMaintenanceDb().insert(schema.organization).values({ id, workspaceId: idOf(state, "workspace"), name, createdAt: nextTime() });
  ids(state)[name] = id;
  return id;
}

async function assignCustomer(state: ScenarioState, customer: string, partner: string) {
  await getMaintenanceDb()
    .insert(schema.customerPartner)
    .values({ organizationId: await insertCustomer(state, customer), partnerId: idOf(state, partner), workspaceId: idOf(state, "workspace") });
}

/**
 * The site of the customer's projects when the scenario names none (task 071: every project has one),
 * written once per customer. It is called "Main site", not after the customer, so that it never matches a
 * customer's name on a page ("I do not see the "Acme Ltd" link" would match a link to "Acme Ltd site").
 */
async function siteOf(state: ScenarioState, customer: string) {
  const key = `${customer}:main site`;
  if (state.ids?.[key]) return state.ids[key];
  const id = crypto.randomUUID();
  await getMaintenanceDb()
    .insert(schema.site)
    .values({ id, workspaceId: idOf(state, "workspace"), organizationId: idOf(state, customer), name: "Main site", createdAt: nextTime() });
  ids(state)[key] = id;
  return id;
}

/** The customer of an internal project: assigned to no partner. */
const HEAD_OFFICE = "Head Office";

/** A project (internal without `partner`, for "Head Office") with one task, at a site of its customer. */
async function insertProject(state: ScenarioState, name: string, task: string, owner?: { partner: string; customer: string }) {
  const db = getMaintenanceDb();
  const id = crypto.randomUUID();
  const customer = owner?.customer ?? HEAD_OFFICE;
  const organizationId = await insertCustomer(state, customer);
  await db.insert(schema.project).values({
    id,
    name,
    workspaceId: idOf(state, "workspace"),
    organizationId,
    siteId: await siteOf(state, customer),
    ...(owner && { visibility: "partner", partnerId: idOf(state, owner.partner) }),
    createdAt: nextTime(),
  });
  const taskId = crypto.randomUUID();
  await db.insert(schema.task).values({ id: taskId, projectId: id, title: task, organizationId, createdAt: nextTime() });
  Object.assign(ids(state), { [name]: id, [task]: taskId, [`${task}:project`]: id });
}

Given(
  "a workspace with the partners {string} and {string}, an admin and an auditor",
  async ({ request, state }, first: string, second: string) => {
    clock = Date.now() - 24 * 60 * 60_000;
    const db = getMaintenanceDb();
    const workspaceId = crypto.randomUUID();
    const admin = await newAccount(request, "Admin");
    const auditor = await newAccount(request, "Auditor");
    // Never signs in: only their id is needed, as another partner's user.
    const globexUser = { id: crypto.randomUUID(), name: `${second} User` };
    await db.insert(schema.user).values({ ...globexUser, email: `${globexUser.id}@example.com` });
    await db.insert(schema.workspace).values({ id: workspaceId, name: "Partner Hub" });
    const partners = { [first]: crypto.randomUUID(), [second]: crypto.randomUUID() };
    await db.insert(schema.partner).values(Object.entries(partners).map(([name, id]) => ({ id, name, workspaceId })));
    await db.insert(schema.workspaceMember).values([
      { workspaceId, userId: admin.id, role: "admin", joinedAt: nextTime() },
      { workspaceId, userId: auditor.id, role: "auditor", joinedAt: nextTime() },
      { workspaceId, userId: globexUser.id, role: "partner", partnerId: partners[second], joinedAt: nextTime() },
    ]);
    state.accounts = { admin: { account: admin.account }, auditor: { account: auditor.account } };
    Object.assign(ids(state), { workspace: workspaceId, ...partners, Admin: admin.id, Auditor: auditor.id, [globexUser.name]: globexUser.id });
  },
);

Given(
  "the customer {string} is assigned to {string} and {string}",
  async ({ state }, customer: string, first: string, second: string) => {
    await assignCustomer(state, customer, first);
    await assignCustomer(state, customer, second);
  },
);

Given("the customer {string} is assigned to {string}", async ({ state }, customer: string, partner: string) => {
  await assignCustomer(state, customer, partner);
});

Given("the internal project {string} has the task {string}", async ({ state }, project: string, task: string) => {
  await insertProject(state, project, task);
});

Given(
  "{string} has the project {string} for {string} with the task {string}",
  async ({ state }, partner: string, project: string, customer: string, task: string) => {
    await insertProject(state, project, task, { partner, customer });
  },
);

// The partner membership comes before any page is opened, so it is my only (and current) workspace.
Given("I am signed in as a user of {string}", async ({ page, state }, partner: string) => {
  await signUp(page, `${partner} User`);
  const me = await userId(page);
  await getMaintenanceDb()
    .insert(schema.workspaceMember)
    .values({ workspaceId: idOf(state, "workspace"), userId: me, role: "partner", partnerId: idOf(state, partner), joinedAt: nextTime() });
  ids(state).me = me;
});

Given("the task {string} is about the customer {string}", async ({ state }, task: string, customer: string) => {
  await getMaintenanceDb()
    .update(schema.task)
    .set({ organizationId: idOf(state, customer) })
    .where(eq(schema.task.id, idOf(state, task)));
});

// Assignments the forms wouldn't make (another partner's task, an internal one): pages mustn't trust them.
Given("the tasks {string} are assigned to me directly", async ({ state }, tasks: string) => {
  for (const task of tasks.split(",").map((t) => t.trim())) {
    await getMaintenanceDb()
      .update(schema.task)
      .set({ assigneeId: idOf(state, "me") })
      .where(eq(schema.task.id, idOf(state, task)));
  }
});

Given("I am also an admin of my own workspace, with the task {string} assigned to me", async ({ state }, task: string) => {
  const db = getMaintenanceDb();
  const workspaceId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  await db.insert(schema.workspace).values({ id: workspaceId, name: "My own" });
  await db.insert(schema.workspaceMember).values({ workspaceId, userId: idOf(state, "me"), role: "admin", joinedAt: new Date() });
  const { organizationId, siteId } = await insertCustomerWithSite(workspaceId, "Side client");
  await db.insert(schema.project).values({ id: projectId, name: "Side project", workspaceId, organizationId, siteId });
  await db.insert(schema.task).values({ id: crypto.randomUUID(), projectId, title: task, assigneeId: idOf(state, "me") });
});

// --- Pages, as me ---------------------------------------------------------------------------------------

Then("the page shows none of {string}", async ({ page }, names: string) => {
  const body = page.locator("body");
  for (const name of names.split(",").map((n) => n.trim())) {
    await expect(body).not.toContainText(name);
  }
});

Then("the project cards are {string}", async ({ page }, names: string) => {
  const cards = page.getByRole("main").getByRole("listitem");
  await expect(cards.locator('a[href*="/projects/"]')).toHaveText(names.split(",").map((n) => n.trim()));
});

When("I open the address of the {string} project", async ({ page, state }, project: string) => {
  await page.goto(projectPath(state, project));
});

When("I open the address of the {string} task", async ({ page, state }, task: string) => {
  await page.goto(taskPath(state, task));
});

When("I open the address of the customer {string}", async ({ page, state }, customer: string) => {
  await page.goto(`/dashboard/customers/${idOf(state, customer)}`);
});

Given("I am on the edit page of the {string} project", async ({ page, state }, project: string) => {
  await page.goto(`${projectPath(state, project)}/edit`);
  await expect(page.getByLabel("Project name")).toHaveValue(project);
});

// The page must not tell a record that exists (but isn't mine) from one that doesn't.
Then(
  "I see {string}, the same as for a made-up {word} address",
  async ({ page }, text: string, kind: string) => {
    const main = page.getByRole("main");
    // The real record's address again, for its status: it must be a 404 like the made-up one.
    const real = await page.reload();
    expect(real?.status()).toBe(404);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(text);
    const shown = await main.innerText();
    const madeUp = crypto.randomUUID();
    const path = {
      project: `/dashboard/projects/${madeUp}`,
      task: `/dashboard/projects/${madeUp}/tasks/${crypto.randomUUID()}`,
      customer: `/dashboard/customers/${madeUp}`,
      site: `/dashboard/sites/${madeUp}`,
      visit: `/dashboard/projects/${madeUp}/visits/${crypto.randomUUID()}`,
    }[kind];
    expect(path, `no made-up address for "${kind}"`).toBeDefined();
    const response = await page.goto(path!);
    expect(response?.status()).toBe(404);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(text);
    expect(await main.innerText()).toBe(shown);
  },
);

Then("the header has no {string} link", async ({ page }, name: string) => {
  const nav = page.getByRole("navigation", { name: "Dashboard" });
  await expect(nav.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
});

Then("there is no {string} field", async ({ page }, label: string) => {
  await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
});

// --- Tampered forms: the real form, with one id changed (`state.replay` posts it again) ---------------------

When(
  "I add the task {string} on {string} with the project id of {string}",
  async ({ page, state }, title: string, project: string, other: string) => {
    state.replay = async (id) => {
      await page.goto(projectPath(state, project));
      await page.getByLabel("Task title").fill(title);
      await page
        .locator("form", { has: page.getByRole("button", { name: "Add task" }) })
        .locator('input[name="projectId"]')
        .evaluate((input, value) => {
          (input as HTMLInputElement).value = value;
        }, id);
      await pressAndWait(page, "Add task");
    };
    await state.replay(idOf(state, other));
  },
);

When(
  "I create the project {string} with the customer id of {string}",
  async ({ page, state }, name: string, customer: string) => {
    state.replay = async (id) => {
      await page.goto("/dashboard/projects/new");
      await page.getByLabel("Project name").fill(name);
      await chooseValue(page.getByLabel("Customer", { exact: true }), id);
      await pressAndWait(page, "Create Project");
    };
    await state.replay(idOf(state, customer));
  },
);

/** Saves a task's edit form with one select set to `id`, as `page`. */
async function saveTaskWith(page: Page, state: ScenarioState, task: string, label: string, id: string) {
  await openTask(page, state, task);
  await chooseValue(page.getByLabel(label, { exact: true }), id);
  await pressAndWait(page, "Save changes");
}

When(
  "I save the task {string} with the assignee id of {string}",
  async ({ page, state }, task: string, person: string) => {
    state.replay = (id) => saveTaskWith(page, state, task, "Assignee", id);
    await state.replay(idOf(state, person));
  },
);

When(
  "I save the task {string} with the customer id of {string}",
  async ({ page, state }, task: string, customer: string) => {
    state.replay = (id) => saveTaskWith(page, state, task, "Customer", id);
    await state.replay(idOf(state, customer));
  },
);

Then("I see {string}, the same as with a made-up id", async ({ page, state }, text: string) => {
  await expect(shownText(page, text)).toBeVisible();
  await state.replay!(crypto.randomUUID());
  await expect(shownText(page, text)).toBeVisible();
});

// --- The admin and the auditor ----------------------------------------------------------------------------

When("the admin opens {string}", async ({ people, state }, path: string) => {
  await (await pageOf(state, people, "admin")).goto(path);
});

Then(
  "the admin's {string} select offers {string} with {string} chosen",
  async ({ people, state }, label: string, options: string, chosen: string) => {
    const select = (await pageOf(state, people, "admin")).getByLabel(label, { exact: true });
    await expect(select.locator("option")).toHaveText(options.split(",").map((o) => o.trim()));
    await expect(select.locator("option:checked")).toHaveText(chosen);
  },
);

When(
  "the admin creates the project {string} for {string} owned by {string}",
  async ({ people, state }, name: string, customer: string, owner: string) => {
    const admin = await pageOf(state, people, "admin");
    await admin.goto("/dashboard/projects/new");
    await chooseCustomerAndSite(admin, customer);
    await admin.getByLabel("Project name").fill(name);
    await admin.getByLabel("Owner", { exact: true }).selectOption({ label: owner });
    await pressAndWait(admin, "Create Project");
  },
);

Then("the admin sees the error {string}", async ({ people, state }, text: string) => {
  await expect(shownText(await pageOf(state, people, "admin"), text)).toBeVisible();
});

Then(
  "the admin's {string} options for the task {string} are {string}",
  async ({ people, state }, label: string, task: string, options: string) => {
    const admin = await pageOf(state, people, "admin");
    await openTask(admin, state, task);
    await expect(admin.getByLabel(label, { exact: true }).locator("option")).toHaveText(options.split(",").map((o) => o.trim()));
  },
);

When(
  "the admin saves the task {string} with the assignee id of {string}",
  async ({ people, state }, task: string, person: string) => {
    await saveTaskWith(await pageOf(state, people, "admin"), state, task, "Assignee", idOf(state, person));
  },
);

When("the admin unassigns {string} from {string}", async ({ people, state }, customer: string, partner: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(`/dashboard/partners/${idOf(state, partner)}`);
  await pressAndWait(admin, `Unassign ${customer}`);
  const customers = admin.getByRole("region", { name: "Customers", exact: true });
  await expect(customers.getByRole("link", { name: customer, exact: true })).toHaveCount(0);
});

Then("the admin sees the {string} project", async ({ people, state }, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto("/dashboard/projects");
  await expect(admin.getByRole("link", { name: project, exact: true }).first()).toBeVisible();
});

Then("the admin sees no project {string}", async ({ people, state }, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto("/dashboard/projects");
  // The table, or the empty list's message when the admin has no projects left.
  await expect(admin.getByRole("table", { name: "Projects" }).or(admin.getByText(/^No projects yet\./))).toBeVisible();
  await expect(admin.getByRole("link", { name: project, exact: true })).toHaveCount(0);
});

Then("the admin sees the tasks of {string} are {string}", async ({ people, state }, project: string, titles: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(projectPath(state, project));
  await expect(admin.getByRole("heading", { name: project, level: 1 })).toBeVisible();
  await expect(admin.getByRole("main").locator('a[href*="/tasks/"]')).toHaveText(titles.split(",").map((t) => t.trim()));
});

Then(
  "the admin sees the task {string} unassigned, for the customer {string}",
  async ({ people, state }, task: string, customer: string) => {
    const admin = await pageOf(state, people, "admin");
    await openTask(admin, state, task);
    await expect(shownText(admin, "Unassigned")).toBeVisible();
    await expect(admin.getByRole("link", { name: customer, exact: true })).toBeVisible();
  },
);

Then(
  "the admin sees the task {string} for the customer {string}, with the description {string}",
  async ({ people, state }, task: string, customer: string, description: string) => {
    const admin = await pageOf(state, people, "admin");
    await openTask(admin, state, task);
    await expect(shownText(admin, description)).toBeVisible();
    await expect(admin.getByRole("link", { name: customer, exact: true })).toBeVisible();
  },
);

When("the auditor opens {string}", async ({ people, state }, path: string) => {
  await (await pageOf(state, people, "auditor")).goto(path);
});

Then("the auditor's projects are {string}", async ({ people, state }, names: string) => {
  const auditor = await pageOf(state, people, "auditor");
  const table = auditor.getByRole("table", { name: "Projects" });
  await expect(table.getByRole("rowheader")).toHaveText(names.split(",").map((n) => n.trim()));
});
