import { expect, type Page } from "@playwright/test";

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

Given("I am on the login page to return to {string}", async ({ page }, next: string) => {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
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

Then("I am on the dashboard", async ({ page }) => {
  await expect(page).toHaveURL((url) => url.origin === new URL(origin).origin && url.pathname === "/dashboard");
});

// Sign-in lockout (task 090). AUTH_DISABLE_RATE_LIMIT is on for the test servers; the lockout counts per account,
// not per address, so it applies all the same.
const WRONG_PASSWORD = "not-the-password-123";
const LOCKED_MESSAGE = "Too many failed sign-ins. Try again in 15 minutes.";

/** Submits the login form and waits for the sign-in answer, so repeated tries are each counted before the next. */
async function logInOnce(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await pacer.wait(SIGN_IN_PATH);
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === SIGN_IN_PATH),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
}

When("I log in with the wrong password {int} times", async ({ page, account }, times: number) => {
  for (let i = 0; i < times; i++) await logInOnce(page, account.email, WRONG_PASSWORD);
});

Given("another account was locked by {int} wrong passwords", async ({ people }, times: number) => {
  const other = await people.newPerson();
  const credentials = { email: `other-${crypto.randomUUID()}@example.com`, password: "correct-horse-battery" };
  expect((await authPost(other.request, SIGN_UP_PATH, { name: "Other Person", ...credentials })).ok()).toBeTruthy();
  for (let i = 0; i < times; i++) {
    expect((await authPost(other.request, SIGN_IN_PATH, { email: credentials.email, password: WRONG_PASSWORD })).ok()).toBeFalsy();
  }
  // The lock is in place: even the right password is refused, with the message the login form shows.
  const locked = await authPost(other.request, SIGN_IN_PATH, credentials);
  expect(locked.ok()).toBeFalsy();
  expect((await locked.json()).message).toBe(LOCKED_MESSAGE);
});

When("I log in with an email that has no account {int} times", async ({ page, state }, times: number) => {
  state.emailWithoutAccount = `nobody-${crypto.randomUUID()}@example.com`;
  for (let i = 0; i < times; i++) await logInOnce(page, state.emailWithoutAccount, WRONG_PASSWORD);
});

When("I log in with that email once more", async ({ page, state }) => {
  const email = state.emailWithoutAccount;
  if (!email) throw new Error("No earlier step typed an email without an account");
  await logInOnce(page, email, WRONG_PASSWORD);
});
