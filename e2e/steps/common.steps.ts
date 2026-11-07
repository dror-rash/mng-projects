import { expect, type Page } from "@playwright/test";

import { Given, Then, When } from "./fixtures";

Given("I am on the home page", async ({ page }) => {
  await page.goto("/");
});

When("I open {string}", async ({ page }, path: string) => {
  await page.goto(path);
});

/** Follows the link named `name` and waits for its page (query string included). */
export async function followLink(page: Page, name: string) {
  const link = page.getByRole("link", { name, exact: true });
  const href = await link.getAttribute("href");
  await link.click();
  // Wait for the navigation, so the next step can't pass against the page we just left.
  if (href?.startsWith("/")) {
    const target = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page).toHaveURL(new RegExp(`${target}$`));
  }
}

/** Text the page shows, not values sitting in form fields. */
export function shownText(page: Page, text: string) {
  return page.getByText(text).and(page.locator(":not(textarea):not(input):not(option)")).first();
}

When("I follow the {string} link", async ({ page }, name: string) => {
  await followLink(page, name);
});

Then("I see the heading {string}", async ({ page }, text: string) => {
  // A page can repeat its title in a section heading (My tasks has both), so any visible match will do.
  await expect(page.getByRole("heading", { name: text }).filter({ visible: true }).first()).toBeVisible();
});

Then("I see the {string} link", async ({ page }, name: string) => {
  await expect(page.getByRole("link", { name })).toBeVisible();
});

Then("I do not see the {string} link", async ({ page }, name: string) => {
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

Then("the URL path is {string}", async ({ page }, path: string) => {
  await expect(page).toHaveURL(new RegExp(`${path}$`));
});

When("I fill in {string} with {string}", async ({ page }, label: string, value: string) => {
  await page.getByLabel(label).fill(value);
});

// Every button these scenarios press submits a form. Wait for that request's response, so a
// following navigation can't cancel the submission (networkidle doesn't wait for fetch-based actions).
When("I press {string}", async ({ page }, name: string) => {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    page.getByRole("button", { name }).click(),
  ]);
});

// Text the page shows, not values sitting in form fields.
Then("I see the text {string}", async ({ page }, text: string) => {
  await expect(shownText(page, text)).toBeVisible();
});

Then("I see the {string} button", async ({ page }, name: string) => {
  await expect(page.getByRole("button", { name })).toBeVisible();
});

Then("the {string} field contains {string}", async ({ page }, label: string, value: string) => {
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
});

When("I select {string} from {string}", async ({ page }, option: string, label: string) => {
  const select = page.getByLabel(label, { exact: true });
  const [value] = await select.selectOption({ label: option });
  // A filter select (in a search form, like All projects') applies on change: a client navigation that
  // remounts the form when it lands. Wait for it, so the next step can't type into a form about to reset.
  if (await select.evaluate((element) => element.closest("form[role=search]") !== null)) {
    const name = (await select.getAttribute("name"))!;
    const pattern = `[?&]${name}=${encodeURIComponent(value!).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:&|$)`;
    await expect(page).toHaveURL(new RegExp(pattern));
  }
});

Then("the {string} section shows {string}", async ({ page }, section: string, text: string) => {
  await expect(page.getByRole("region", { name: section, exact: true })).toContainText(text);
});

Then("the {string} section does not show {string}", async ({ page }, section: string, text: string) => {
  await expect(page.getByRole("region", { name: section, exact: true })).not.toContainText(text);
});
