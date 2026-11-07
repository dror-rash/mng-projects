import { expect } from "@playwright/test";

import { authPost, Given, origin, pacer, SIGN_IN_PATH, SIGN_UP_PATH, Then, When } from "./fixtures";

// `request` is a separate cookie jar from `page`, so registering doesn't sign the browser in.
// Sign-ups and sign-ins are paced against a deployment (task 069, fixtures.ts).
Given("an existing account", async ({ request, account }) => {
  const response = await authPost(request, SIGN_UP_PATH, { name: "Test User", email: account.email, password: account.password });
  expect(response.ok()).toBeTruthy();
});

Given("I am signed in with an existing account", async ({ request, page, account }) => {
  const signUp = await authPost(request, SIGN_UP_PATH, { name: "Test User", email: account.email, password: account.password });
  expect(signUp.ok()).toBeTruthy();

  // page.request shares cookies with the browser context.
  const signIn = await authPost(page.request, SIGN_IN_PATH, { email: account.email, password: account.password });
  expect(signIn.ok()).toBeTruthy();
});

Given("I am on the login page", async ({ page }) => {
  await page.goto("/login");
});

Given("I am on the sign up page", async ({ page }) => {
  await page.goto("/signup");
});

When("I sign up with a new account", async ({ page, account }) => {
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await pacer.wait(SIGN_UP_PATH);
  await page.getByRole("button", { name: "Create account" }).click();
});

When("I log in with my email and password", async ({ page, account }) => {
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await pacer.wait(SIGN_IN_PATH);
  await page.getByRole("button", { name: "Log in" }).click();
});

When("I log in with the wrong password", async ({ page, account }) => {
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill("not-the-password-123");
  await pacer.wait(SIGN_IN_PATH);
  await page.getByRole("button", { name: "Log in" }).click();
});

When("I log out", async ({ page }) => {
  await page.getByRole("button", { name: "Log out" }).click();
});

Then("I see my email address", async ({ page, account }) => {
  await expect(page.getByText(account.email)).toBeVisible();
});

Then("I see the error {string}", async ({ page }, message: string) => {
  // Next.js also renders an empty role="alert" route announcer, so match on the text.
  await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
});

Then("I am sent to the login page", async ({ page }) => {
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});

// A cookie that passes the middleware's presence check but matches no session in the database.
Given("I have an expired session", async ({ context }) => {
  // Production builds (CI) use the __Secure- prefixed name.
  const { hostname } = new URL(origin);
  await context.addCookies(
    ["better-auth.session_token", "__Secure-better-auth.session_token"].map((name) => ({
      name,
      value: "expired.session",
      domain: hostname,
      path: "/",
      secure: name.startsWith("__Secure-"),
    })),
  );
});

Then("I am sent to the login page to return to {string}", async ({ page }, next: string) => {
  await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === next);
});
