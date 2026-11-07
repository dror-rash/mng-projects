import { expect, type Page } from "@playwright/test";

import { Given, signUp, Then, userId, When } from "./fixtures";
import { createProject } from "./project-form";

// Dashboard card titles are headings too, so wait for the project URL before checking the page.
async function openProjectFromDashboard(page: Page, name: string) {
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

export function taskCard(page: Page, title: string) {
  return page.getByRole("listitem").filter({ hasText: title });
}

export function taskInColumn(page: Page, title: string, column: string) {
  return page.getByRole("region", { name: column }).getByRole("listitem").filter({ hasText: title });
}

Given("I have a project named {string}", async ({ page }, name: string) => {
  await createProject(page, name);
});

Given("I have projects named {string}", async ({ page }, names: string) => {
  for (const name of names.split(",").map((n) => n.trim())) {
    await createProject(page, name);
  }
});

Given("I am on the {string} project page", async ({ page }, name: string) => {
  await page.goto("/dashboard/projects");
  await openProjectFromDashboard(page, name);
});

Given("the project has a task {string}", async ({ page }, title: string) => {
  await page.getByLabel("Task title").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(taskCard(page, title)).toBeVisible();
});

Given("another user has a project named {string}", async ({ people, state }, name: string) => {
  const other = await people.newPerson();
  await signUp(other, "Other User");
  await createProject(other, name);
  state.otherUsersProjectUrl = other.url();
});

When("I open the other user's project", async ({ page, state }) => {
  expect(state.otherUsersProjectUrl).toBeDefined();
  await page.goto(state.otherUsersProjectUrl!);
});

When("I open the other user's project {string} page", async ({ page, state }, subpage: string) => {
  expect(state.otherUsersProjectUrl).toBeDefined();
  await page.goto(`${state.otherUsersProjectUrl!}/${subpage}`);
});

When("I move the task {string} to {string}", async ({ page }, title: string, status: string) => {
  await taskCard(page, title).getByRole("button", { name: `Move to ${status}` }).click();
  // Wait for the save to land, so a following navigation can't cancel it.
  await expect(taskInColumn(page, title, status)).toBeVisible();
});

// The drag handle appears once the board is interactive. dnd-kit listens for pointer events, so
// drive the mouse by hand: press on the handle, move in steps (past the activation distance), release.
When("I drag the task {string} to the {string} column", async ({ page }, title: string, column: string) => {
  const handle = taskCard(page, title).getByRole("button", { name: `Drag ${title}` });
  await expect(handle).toBeVisible();
  // The mouse doesn't scroll: bring the card and the column (side by side) into view first.
  await handle.scrollIntoViewIfNeeded();
  await page.getByRole("region", { name: column }).scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await page.getByRole("region", { name: column }).boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  // Wait for the save to land, so a following reload can't cancel it.
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.mouse.up()]);
});

Then("a screen reader hears {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("status").filter({ hasText: text })).toHaveCount(1);
});

When("I delete the task {string}", async ({ page }, title: string) => {
  await taskCard(page, title).getByRole("button", { name: "Delete task" }).click();
  await expect(taskCard(page, title)).toHaveCount(0);
});

Then("the task {string} is in the {string} column", async ({ page }, title: string, column: string) => {
  await expect(taskInColumn(page, title, column)).toBeVisible();
});

Then("I do not see the task {string}", async ({ page }, title: string) => {
  await expect(taskCard(page, title)).toHaveCount(0);
});

Then("I do not see the text {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toHaveCount(0);
});

// Opens a task from the project board the browser is on.
Given("I am on the {string} task page", async ({ page }, title: string) => {
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[^/]+\/tasks\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
});

Then("the task {string} shows {string}", async ({ page }, title: string, text: string) => {
  await expect(taskCard(page, title)).toContainText(text);
});

// Same browser context = same signed-in user, like a second tab.
When("the task {string} is deleted in another tab", async ({ context, page }, title: string) => {
  const tab = await context.newPage();
  await tab.goto(page.url());
  await Promise.all([
    tab.waitForResponse((r) => r.request().method() === "POST"),
    tab.getByRole("button", { name: "Delete task" }).click(),
  ]);
  await expect(tab.getByRole("heading", { name: title, level: 1 })).toHaveCount(0);
  await tab.close();
});

// Opens a task from the project board the browser is on.
async function openTaskFromBoard(page: Page, title: string) {
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[^/]+\/tasks\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

// Saves the task form and waits for the server action's response.
async function saveTask(page: Page) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByRole("button", { name: "Save changes" }).click(),
  ]);
}

async function backToBoard(page: Page) {
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[^/]+$/);
}

// Sets a task's priority from its page, starting and ending on the project board.
// Use a non-default priority: the check below is already true for Medium before saving.
Given("the task {string} has priority {string}", async ({ page }, title: string, priority: string) => {
  await openTaskFromBoard(page, title);
  await page.getByLabel("Priority", { exact: true }).selectOption({ label: priority });
  await saveTask(page);
  await expect(page.getByText(`${priority} priority`).first()).toBeVisible();
  await backToBoard(page);
});

Then("the {string} column lists {string}", async ({ page }, column: string, titles: string) => {
  // The column's name includes its task count ("To do 2"), so match it loosely.
  const links = page.getByRole("region", { name: column }).getByRole("listitem").getByRole("link");
  await expect(links).toHaveText(titles.split(",").map((t) => t.trim()));
});

// Calendar days in UTC, like the app ("today" is the server's UTC date). Scenarios keep a margin of
// several days so the runner and the server can't disagree about which day it is (clock skew, midnight).
function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

When("I set the due date to {int} days from today", async ({ page, state }, days: number) => {
  state.dueDate = daysFromToday(days);
  await page.getByLabel("Due date", { exact: true }).fill(state.dueDate);
});

When("I clear the due date", async ({ page }) => {
  await page.getByLabel("Due date", { exact: true }).fill("");
});

Then("I see the due date {int} days from today", async ({ page, state }, days: number) => {
  const due = state.dueDate ?? daysFromToday(days);
  await expect(page.locator(`time[datetime="${due}"]`).first()).toBeVisible();
});

// Sets a task's due date from its page, starting and ending on the project board.
async function taskIsDue(page: Page, title: string, days: number) {
  const due = daysFromToday(days);
  await openTaskFromBoard(page, title);
  await page.getByLabel("Due date", { exact: true }).fill(due);
  await saveTask(page);
  await expect(page.locator(`time[datetime="${due}"]`).first()).toBeVisible();
  await backToBoard(page);
}

Given("the task {string} is due {int} days ago", async ({ page }, title: string, days: number) => {
  await taskIsDue(page, title, -days);
});

Given("the task {string} is due {int} days from today", async ({ page }, title: string, days: number) => {
  await taskIsDue(page, title, days);
});

Then("the task {string} does not show {string}", async ({ page }, title: string, text: string) => {
  // The card must be there first, or the negative check would pass on a page without it.
  await expect(taskCard(page, title)).toBeVisible();
  await expect(taskCard(page, title)).not.toContainText(text);
});

// Assigns a task from its page, starting and ending on the project board.
Given("the task {string} is assigned to {string}", async ({ page }, title: string, person: string) => {
  await openTaskFromBoard(page, title);
  await page.getByLabel("Assignee", { exact: true }).selectOption({ label: person });
  await saveTask(page);
  await expect(page.getByText(`Assigned to ${person}`)).toBeVisible();
  await backToBoard(page);
});

// Simulates a tampered form: the id of a real user who isn't a member of this workspace.
When("I choose someone outside the workspace in {string}", async ({ page, people }, label: string) => {
  const outsider = await people.newPerson();
  await signUp(outsider, "Outsider");
  const outsiderId = await userId(outsider);
  await page.getByLabel(label, { exact: true }).evaluate((select, id) => {
    const option = document.createElement("option");
    option.value = id;
    option.text = "Someone outside";
    select.appendChild(option);
    (select as HTMLSelectElement).value = id;
  }, outsiderId);
});

Given(
  "another user has a project {string} with a task {string}",
  async ({ people, state }, project: string, title: string) => {
    const other = await people.newPerson();
    await signUp(other, "Other User");
    await createProject(other, project);
    await other.getByLabel("Task title").fill(title);
    await other.getByRole("button", { name: "Add task" }).click();
    await expect(taskCard(other, title)).toBeVisible();
    await openTaskFromBoard(other, title);
    state.otherTaskUrl = other.url();
    state.otherPerson = other;
  },
);

When("I open the other user's task page", async ({ page, state }) => {
  await page.goto(state.otherTaskUrl!);
});

// Simulates a tampered form: my own project, but the other user's task id.
When("I point the form at the other user's task", async ({ page, state }) => {
  const foreignId = new URL(state.otherTaskUrl!).pathname.split("/").pop()!;
  await page
    .locator("form", { has: page.getByRole("button", { name: "Save changes" }) })
    .locator('input[name="taskId"]')
    .evaluate((input, id) => {
      (input as HTMLInputElement).value = id;
    }, foreignId);
});

Then("the other user's task is still named {string}", async ({ state }, title: string) => {
  const other = state.otherPerson!;
  await other.reload();
  await expect(other.getByRole("heading", { name: title, level: 1 })).toBeVisible();
});

function myTasks(page: Page) {
  return page.getByRole("region", { name: "My tasks", exact: true }).getByRole("listitem");
}

Then("my task {string} shows {string}", async ({ page }, title: string, text: string) => {
  await expect(myTasks(page).filter({ hasText: title })).toContainText(text);
});

Then("my tasks are {string}", async ({ page }, titles: string) => {
  await expect(myTasks(page).getByRole("link")).toHaveText(titles.split(",").map((t) => t.trim()));
});

When("I reload the page", async ({ page }) => {
  await page.reload();
});
