import { expect } from "@playwright/test";

import { Given, origin, Then, When } from "./fixtures";

// Languages (task 094, ADR-0011). The choice is the `locale` cookie; without it the server reads Accept-Language.

// The server picks the language from the Accept-Language header, so the browser sends that header from now on.
// Chromium replaces an extra Accept-Language header with its own (from the context's `locale`), so the header is
// rewritten on the way out instead. Context-level, so steps that route a page (page.route) are unaffected.
Given("my browser prefers {string}", async ({ context }, locale: string) => {
  await context.route("**/*", (route) =>
    route.continue({ headers: { ...route.request().headers(), "accept-language": locale } }),
  );
});

Given("my language cookie is set to {string}", async ({ context }, value: string) => {
  const { hostname } = new URL(origin);
  await context.addCookies([{ name: "locale", value, domain: hostname, path: "/" }]);
});

When("I choose the {string} language", async ({ page }, name: string) => {
  const option = page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name, exact: true });
  await expect(option).toBeVisible();
  await option.click();
});

Then("the page is right to left", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

Then("the page is left to right", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
