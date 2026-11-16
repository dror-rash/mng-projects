import { expect, type Page } from "@playwright/test";

import { Then, When } from "./fixtures";
import { ids, pageOf, projectPath } from "./partner-access.steps";
import { partnerUser } from "./reports.steps";
import { myRecordId } from "./sites.steps";

// Project page tabs (task 122): a list of links named "Project sections" (Hebrew "חלקי הפרויקט") under the stage
// bar and the "Next step" card, one link per tab, the open one with `aria-current="page"`. Each tab is its own
// address (`?tab=overview|sales|work|reports|billing`). The steps look only inside that navigation: the stage
// bar's phase headings are also "Sales" and "Work".

const sectionsNav = (page: Page) => page.getByRole("navigation", { name: /^(Project sections|חלקי הפרויקט)$/ });

const tabLink = (page: Page, tab: string) => sectionsNav(page).getByRole("link", { name: tab, exact: true });

When("I open the {string} tab", async ({ page }, tab: string) => {
  const link = tabLink(page, tab);
  await expect(link).toHaveAttribute("href", /\S/);
  const href = await link.getAttribute("href");
  await link.click();
  // Wait for the tab's address, so the next step can't pass against the tab we just left.
  await expect(page).toHaveURL(new URL(href!, page.url()).href);
  await expect(link).toHaveAttribute("aria-current", "page");
});

Then("the {string} tab is open", async ({ page }, tab: string) => {
  await expect(tabLink(page, tab)).toHaveAttribute("aria-current", "page");
  await expect(sectionsNav(page).locator('[aria-current="page"]')).toHaveCount(1);
});

// The open tab's sections: the regions of <main> after the tab links (the "Next step" card and the stage bar
// are above them), in page order. A name matches from its start: the board's columns carry their counts ("To do 1").
Then("the page shows the sections {string}", async ({ page }, names: string) => {
  const expected = names.split(",").map((n) => n.trim());
  const sections = sectionsNav(page)
    .locator("xpath=following::*")
    .and(page.getByRole("main").getByRole("region"));
  await expect(sections).toHaveCount(expected.length);
  for (const [i, name] of expected.entries()) {
    await expect(sections.nth(i)).toHaveAccessibleName(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

When(
  "I open the {string} project page with {string} in its address",
  async ({ page, state }, project: string, suffix: string) => {
    const id = ids(state)[project] ?? (await myRecordId(page, "project", project));
    await page.goto(`/dashboard/projects/${id}${suffix}`);
    await expect(page.getByRole("heading", { name: project, level: 1 })).toBeVisible();
  },
);

// Another person's page at a tab's address (`?tab=work` for "Work"), the way they'd land there from a link.
const TAB_VALUES: Record<string, string> = {
  Overview: "overview",
  Sales: "sales",
  Work: "work",
  Reports: "reports",
  Billing: "billing",
};

async function openTabOf(page: Page, path: string, tab: string, project: string) {
  const value = TAB_VALUES[tab];
  expect(value, `no tab named "${tab}"`).toBeDefined();
  await page.goto(`${path}?tab=${value}`);
  await expect(page.getByRole("heading", { name: project, level: 1 })).toBeVisible();
}

for (const who of ["admin", "auditor"] as const) {
  When(`the ${who} opens the {string} tab of the {string} project`, async ({ people, state }, tab: string, project: string) => {
    await openTabOf(await pageOf(state, people, who), projectPath(state, project), tab, project);
  });
}

When(
  "the {string} user opens the {string} tab of the {string} project",
  async ({ people, state }, partner: string, tab: string, project: string) => {
    await openTabOf(await partnerUser(state, people, partner), projectPath(state, project), tab, project);
  },
);
