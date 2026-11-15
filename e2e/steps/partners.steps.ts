import { expect, type Page } from "@playwright/test";

import { Given, Then, When } from "./fixtures";
import { dashboardNav } from "./layout.steps";
import { membersRow, pressAndWait } from "./workspaces.steps";

/** Creates a partner from the New partner page; ends on its page. */
async function createPartner(page: Page, name: string) {
  await page.goto("/dashboard/partners/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create partner" }).click();
  await expect(page).toHaveURL(/\/dashboard\/partners\/[^/]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** The address of one of my partners, from the Partners list. */
async function partnerUrl(page: Page, name: string) {
  await page.goto("/dashboard/partners");
  return (await page.getByRole("link", { name, exact: true }).getAttribute("href"))!;
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

Given("I have a partner {string}", async ({ page }, name: string) => {
  await createPartner(page, name);
});

Given("I have a partner {string} with the customer {string}", async ({ page }, name: string, customer: string) => {
  await createPartner(page, name);
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: customer });
  await pressAndWait(page, "Assign customer");
  // A link, not the option of the Customer select.
  await expect(section(page, "Customers").getByRole("link", { name: customer, exact: true })).toBeVisible();
});

When("I open the {string} partner page", async ({ page }, name: string) => {
  await page.goto(await partnerUrl(page, name));
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
});

When("I open the invite link", async ({ page, state }) => {
  await page.goto(state.inviteLink!);
});

When("I change the role of {string} to {string}", async ({ page }, name: string, role: string) => {
  await page.goto("/dashboard/workspace");
  await page.getByLabel(`Role for ${name}`, { exact: true }).selectOption({ label: role });
  await pressAndWait(page, `Change role ${name}`);
  await expect(membersRow(page, name).getByText(role, { exact: true }).and(page.locator(":not(option)"))).toBeVisible();
});

Then(
  "the auditor sees the {string} partner with the customer {string} and no {string} or {string} buttons",
  async ({ state }, name: string, customer: string, assign: string, unassign: string) => {
    const auditor = state.teammate!;
    // Partners is out of the menu (task 070); the page opens by its address.
    await auditor.goto("/dashboard/partners");
    await auditor.getByRole("link", { name, exact: true }).click();
    await expect(auditor.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(section(auditor, "Customers").getByRole("link", { name: customer, exact: true })).toBeVisible();
    await expect(auditor.getByRole("button", { name: assign })).toHaveCount(0);
    await expect(auditor.getByRole("button", { name: new RegExp(`^${unassign}\\b`) })).toHaveCount(0);
    await expect(auditor.getByRole("combobox")).toHaveCount(0);
  },
);

Then("the teammate sees no {string} link in the header", async ({ state }, name: string) => {
  const teammate = state.teammate!;
  await teammate.goto("/dashboard");
  const nav = dashboardNav(teammate);
  await expect(nav.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
});

Then(
  "the teammate opening the {string} partner page sees {string}",
  async ({ page, state }, name: string, text: string) => {
    const teammate = state.teammate!;
    await teammate.goto(await partnerUrl(page, name));
    await expect(teammate.getByText(text, { exact: true })).toBeVisible();
  },
);
