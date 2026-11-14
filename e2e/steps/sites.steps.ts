import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { Given, origin, type People, type ScenarioState, signUp, Then, userId, When } from "./fixtures";
import { idOf, ids, pageOf, shownText } from "./partner-access.steps";

// Sites and on-site contacts (task 054, ADR-0008).

/** The id of the record named `name` in `table`, in one of the workspaces of `page`'s user. */
export async function myRecordId(page: Page, table: "organization" | "site" | "project", name: string) {
  const me = await userId(page);
  const { rows } = await getMaintenanceDb().execute<{ id: string }>(
    sql`select t.id from ${sql.identifier(table)} t
        where t.name = ${name}
          and t.workspace_id in (select workspace_id from workspace_member where user_id = ${me})`,
  );
  expect(rows, `no ${table} named "${name}"`).toHaveLength(1);
  return rows[0]!.id;
}

/** Adds a site with a made-up address (so it has a maps link); ends on its page. */
async function addSite(page: Page, customerId: string, name: string) {
  await page.goto(`/dashboard/sites/new?customer=${customerId}`);
  await page.getByLabel("Site name", { exact: true }).fill(name);
  await page.getByLabel("Address", { exact: true }).fill("1 Main St");
  await page.getByRole("button", { name: "Save site" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

Given("{string} has a site {string}", async ({ page }, customer: string, name: string) => {
  await addSite(page, await myRecordId(page, "organization", customer), name);
});

When("I open the {string} site page", async ({ page }, name: string) => {
  await page.goto(`/dashboard/sites/${await myRecordId(page, "site", name)}`);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
});

Given("the site {string} has a contact {string}", async ({ page }, site: string, name: string) => {
  await page.goto(`/dashboard/sites/${await myRecordId(page, "site", site)}`);
  await page.getByLabel("Contact name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("region", { name: "On-site contacts", exact: true })).toContainText(name);
});

// A page whose JavaScript hasn't run yet (a slow phone, or a full page load after a failed client navigation)
// submits its forms as plain form posts, not through the client router (task 114). The dashboard's scripts
// are refused for the rest of the scenario; the pages' server HTML, styles and the session still load.
Given("my connection is so slow that pages haven't finished loading when I use them", async ({ page }) => {
  await page.route("**/dashboard/_next/static/**", (route) =>
    route.request().resourceType() === "script" ? route.abort() : route.fallback(),
  );
});

When("I open the new site page for {string}", async ({ page }, customer: string) => {
  await page.goto(`/dashboard/sites/new?customer=${await myRecordId(page, "organization", customer)}`);
});

/** The customer page's Sites section: its own sites' links, in order (task 072). */
Then("the sites listed are {string}", async ({ page }, expected: string) => {
  const links = page.getByRole("region", { name: "Sites", exact: true }).getByRole("listitem").getByRole("link");
  await expect(links).toHaveText(expected.split(",").map((s) => s.trim()));
});

Then("the URL path is the {string} customer page", async ({ page }, customer: string) => {
  const id = await myRecordId(page, "organization", customer);
  await expect(page).toHaveURL((url) => url.pathname === `/dashboard/customers/${id}`);
});

Given("I keep the link to the {string} site", async ({ page, state }, name: string) => {
  state.keptUrl = `/dashboard/sites/${await myRecordId(page, "site", name)}`;
});

When("I open the kept site link", async ({ page, state }) => {
  expect(state.keptUrl).toBeDefined();
  await page.goto(state.keptUrl!);
});

Given(
  "another user has a customer {string} with a site {string}",
  async ({ people, state }, customer: string, site: string) => {
    const other = await people.newPerson();
    await signUp(other, "Other User");
    await other.goto("/dashboard/customers/new");
    await other.getByLabel("Name", { exact: true }).fill(customer);
    await other.getByRole("button", { name: "Save customer" }).click();
    await expect(other.getByRole("heading", { name: customer, level: 1 })).toBeVisible();
    await addSite(other, new URL(other.url()).pathname.split("/").pop()!, site);
    state.otherUsersSiteUrl = other.url();
  },
);

When("I open the other user's site page", async ({ page, state }) => {
  expect(state.otherUsersSiteUrl).toBeDefined();
  await page.goto(state.otherUsersSiteUrl!);
});

When("I open the new site page for the other user's customer", async ({ page, state }) => {
  expect(state.otherUsersCustomerUrl).toBeDefined();
  const customerId = new URL(state.otherUsersCustomerUrl!, origin).pathname.split("/").pop()!;
  await page.goto(`/dashboard/sites/new?customer=${customerId}`);
});

// --- The leak suite's two-partner workspace (partner-access.steps.ts) --------------------------------------

Given(
  "the customer {string} has the site {string} with the contact {string}",
  async ({ state }, customer: string, site: string, contact: string) => {
    const db = getMaintenanceDb();
    const siteId = crypto.randomUUID();
    await db.execute(
      sql`insert into site (id, workspace_id, organization_id, name, address)
          values (${siteId}, ${idOf(state, "workspace")}, ${idOf(state, customer)}, ${site}, '1 Main St')`,
    );
    await db.execute(sql`insert into site_contact (id, site_id, name) values (${crypto.randomUUID()}, ${siteId}, ${contact})`);
    ids(state)[site] = siteId;
  },
);

const sitePath = (state: Parameters<typeof idOf>[0], site: string) => `/dashboard/sites/${idOf(state, site)}`;

When("I open the address of the site {string}", async ({ page, state }, site: string) => {
  await page.goto(sitePath(state, site));
});

When("the auditor opens the address of the site {string}", async ({ people, state }, site: string) => {
  const auditor = await pageOf(state, people, "auditor");
  await auditor.goto(sitePath(state, site));
  await expect(auditor.getByRole("heading", { name: site, level: 1 })).toBeVisible();
});

/** Text shown on the auditor's page (not in a form field). */
export async function expectAuditorSees(people: People, state: ScenarioState, text: string) {
  await expect(shownText(await pageOf(state, people, "auditor"), text)).toBeVisible();
}

Then("the auditor sees the text {string}", async ({ people, state }, text: string) => {
  await expectAuditorSees(people, state, text);
});

Then(
  "the auditor sees no {string} link on the site {string}",
  async ({ people, state }, name: string, site: string) => {
    const auditor = await pageOf(state, people, "auditor");
    await auditor.goto(sitePath(state, site));
    await expect(auditor.getByRole("heading", { name: site, level: 1 })).toBeVisible();
    await expect(auditor.getByRole("link", { name, exact: true })).toHaveCount(0);
  },
);

Then(
  "the auditor sees no {string} button on the site {string}",
  async ({ people, state }, name: string, site: string) => {
    const auditor = await pageOf(state, people, "auditor");
    await auditor.goto(sitePath(state, site));
    await expect(auditor.getByRole("heading", { name: site, level: 1 })).toBeVisible();
    await expect(auditor.getByRole("button", { name, exact: true })).toHaveCount(0);
  },
);

When("the auditor opens the {string} customer page", async ({ people, state }, customer: string) => {
  const auditor = await pageOf(state, people, "auditor");
  await auditor.goto(`/dashboard/customers/${idOf(state, customer)}`);
  await expect(auditor.getByRole("heading", { name: customer, level: 1 })).toBeVisible();
});

Then(
  "the auditor sees no {string} link on the {string} customer page",
  async ({ people, state }, name: string, customer: string) => {
    const auditor = await pageOf(state, people, "auditor");
    await auditor.goto(`/dashboard/customers/${idOf(state, customer)}`);
    await expect(auditor.getByRole("heading", { name: customer, level: 1 })).toBeVisible();
    await expect(auditor.getByRole("link", { name, exact: true })).toHaveCount(0);
  },
);
