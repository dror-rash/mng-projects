import { expect, type Locator, type Page } from "@playwright/test";

import { Given, Then, When } from "./fixtures";

// The dashboard's menu frame (task 119): the side menu on a wide screen, the top bar or the open drawer on a
// phone. The steps don't pin which landmark each part is: the frame is whatever the page shows outside its
// <main> (the drawer opens in a portal, outside <main> too). The "header" steps read it as the menu frame.

/** Elements outside the page's <main>: the menu frame. */
function outsideMain(page: Page) {
  return page.locator(":not(main *)");
}

/** A visible match of `locator` in the menu frame (hidden copies, e.g. the side menu on a phone, don't count). */
function inFrame(page: Page, locator: Locator) {
  return locator.and(outsideMain(page)).filter({ visible: true });
}

/** The dashboard nav that is on screen: the side menu's, or the open drawer's on a phone. */
export function dashboardNav(page: Page) {
  return page.getByRole("navigation", { name: "Dashboard" }).filter({ visible: true });
}

Given("my screen is {int} pixels wide", async ({ page }, width: number) => {
  await page.setViewportSize({ width, height: 800 });
});

Then("the page does not scroll sideways", async ({ page }) => {
  await expect(page.getByRole("main")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

Then("every dashboard nav link is on screen", async ({ page }) => {
  const width = page.viewportSize()!.width;
  const links = dashboardNav(page).getByRole("link");
  // Overview, All projects and Customers (admins and auditors).
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) {
    await expect(link).toBeVisible();
    // A drawer slides in, so wait for each link to settle inside the screen.
    await expect
      .poll(async () => {
        const box = await link.boundingBox();
        return box !== null && box.x >= 0 && box.x + box.width <= width;
      })
      .toBe(true);
  }
});

Then("the dashboard menu links are {string}", async ({ page }, names: string) => {
  await expect(dashboardNav(page).getByRole("link")).toHaveText(names.split(",").map((name) => name.trim()));
});

Then("the header shows the workspace {string}", async ({ page }, name: string) => {
  await expect(inFrame(page, page.getByRole("link", { name: `${name}: switch workspace`, exact: true }))).toBeVisible();
});

Then("the header says {string}", async ({ page }, text: string) => {
  await expect(inFrame(page, page.getByText(text)).first()).toBeVisible();
});

Then("the header does not say {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("main")).toBeVisible();
  await expect(inFrame(page, page.getByText(text))).toHaveCount(0);
});

When("I open the customer from my other workspace", async ({ page, state }) => {
  await page.goto(state.foreignCustomerUrl!);
});

// --- The side menu (task 119) ------------------------------------------------------------------------------

Then("the menu marks {string} as the current page", async ({ page }, name: string) => {
  const nav = dashboardNav(page);
  await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
});

Then("no menu item is marked as the current page", async ({ page }) => {
  const nav = dashboardNav(page);
  await expect(nav.getByRole("link").first()).toBeVisible();
  await expect(nav.locator('[aria-current]:not([aria-current="false"])')).toHaveCount(0);
});

When("I open the menu", async ({ page }) => {
  const button = page.getByRole("button", { name: "Open menu", exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(dashboardNav(page)).toBeVisible();
});

When("I close the menu with the Escape key", async ({ page }) => {
  await expect(dashboardNav(page)).toBeVisible();
  await page.keyboard.press("Escape");
});

// On a phone: the menu button is there and no nav link is on screen.
Then("the dashboard menu is closed", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
  await expect(dashboardNav(page)).toHaveCount(0);
});

// A column beside the page's content, on its right (shared with task 096).
Then("the menu is on the right", async ({ page }) => {
  const nav = dashboardNav(page);
  await expect(nav).toBeVisible();
  const width = page.viewportSize()!.width;
  const navBox = (await nav.boundingBox())!;
  const mainBox = (await page.getByRole("main").boundingBox())!;
  expect(navBox.x, "the menu is in the right half of the screen").toBeGreaterThanOrEqual(width / 2);
  expect(mainBox.x + mainBox.width, "the content ends where the menu starts").toBeLessThanOrEqual(navBox.x + 1);
});
