import { type APIRequestContext, type Browser, type BrowserContext, expect, type Page } from "@playwright/test";
import { test as base, createBdd } from "playwright-bdd";

import { createPacer, limitedPath } from "../support/pacing";

export type Account = { email: string; password: string };

/** Values a step records for later steps in the same scenario. */
export type ScenarioState = {
  otherUsersProjectUrl?: string;
  otherUsersCustomerUrl?: string;
  otherUsersSiteUrl?: string;
  dueDate?: string;
  inviteLink?: string;
  teammate?: Page;
  /** Another person (not a member of my workspaces), when a later step needs them again. */
  otherPerson?: Page;
  otherWorkspaceId?: string;
  otherTaskUrl?: string;
  /** A customer in a workspace other than the one a later step works in. */
  foreignCustomerUrl?: string;
  keptUrl?: string;
  /** Signed storage URLs of attachments (task 086), copied before a later step changes the workspace. */
  copiedDownloadUrls?: string[];
  /** Partner-access scenarios: the ids of records written to the database, by name (projects, tasks, people, …). */
  ids?: Record<string, string>;
  /** Accounts that sign in only when a step needs them ("admin", "auditor"), and their pages once they have. */
  accounts?: Record<string, { account: Account; page?: Page }>;
  /** Posts the last tampered form again with another id, to compare the refusals. */
  replay?: (id: string) => Promise<void>;
  /** The last form post a step watched (task 058), to send it again as it was. */
  lastPost?: { url: string; headers: Record<string, string>; body: Buffer | null };
  /** Reading forms (task 060): the hidden fields of a form's buttons ("<form>:<button>"), to post them from another form. */
  hiddenFields?: Record<string, Record<string, string>>;
  /** The POC flow (task 069): the other people by role ("worker", "partner user"), each in their own browser. */
  roles?: Record<string, { page: Page; projectPath?: string; visitPath?: string }>;
  /** Sign-in lockout (task 090): an email no account has, typed again by a later step. */
  emailWithoutAccount?: string;
};

/** Opens extra browser contexts (other people) and closes them when the scenario ends. */
export type People = { newPerson: () => Promise<Page> };

export const origin = process.env.BASE_URL ?? `http://localhost:${process.env.SHELL_PORT ?? 3000}`;

export const SIGN_UP_PATH = "/api/auth/sign-up/email";
export const SIGN_IN_PATH = "/api/auth/sign-in/email";

/**
 * Sign-up and sign-in pacing (task 069): against a deployment (BASE_URL), no request to one of those paths goes
 * out within 10 seconds plus a margin of the previous one to the same path, so the run stays under Better Auth's
 * limit (3 per 10 seconds per IP). Locally the limit is off (AUTH_DISABLE_RATE_LIMIT) and nothing waits.
 * The timeline lives in the worker process: after a failed scenario Playwright starts a new worker with an empty
 * timeline, whose first sign-up and sign-in can follow the last ones by less than `gapMs`. A gap above the 10 s
 * window keeps the server's count at 1, so that extra request makes 2, still under 3: the margin absorbs a
 * restart. Don't tighten `gapMs` toward the limit.
 */
export const pacer = createPacer({ enabled: Boolean(process.env.BASE_URL), gapMs: 11_500 });

/** Posts a sign-up or sign-in through the pacing; returns the response. */
export function authPost(request: APIRequestContext, path: typeof SIGN_UP_PATH | typeof SIGN_IN_PATH, data: Record<string, string>) {
  return pacer.send(path, () => request.post(path, { data, headers: { origin } }));
}

/** Records the sign-ups and sign-ins a browser sends by itself (the sign-up and log-in pages) on the pacing's timeline. */
function watchAuthRequests(context: BrowserContext) {
  const record = (url: string) => {
    const path = limitedPath(url);
    if (path) pacer.record(path);
  };
  context.on("response", (response) => record(response.url()));
  context.on("requestfailed", (request) => record(request.url()));
}

/** Signs up and signs in a new person (in their own browser context) with a unique email; returns the account. */
export async function signUp(page: Page, name: string): Promise<Account> {
  const credentials = { email: `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}@example.com`, password: "correct-horse-battery" };
  expect((await authPost(page.request, SIGN_UP_PATH, { name, ...credentials })).ok()).toBeTruthy();
  expect((await authPost(page.request, SIGN_IN_PATH, credentials)).ok()).toBeTruthy();
  return credentials;
}

/** The signed-in user's id, as Better Auth reports it. */
export async function userId(page: Page): Promise<string> {
  const response = await page.request.get("/api/auth/get-session");
  expect(response.ok()).toBeTruthy();
  return (await response.json()).user.id;
}

/** Every scenario gets its own unique account, so runs never collide in a persistent database. */
export const test = base.extend<{ account: Account; state: ScenarioState; people: People; authTimeline: void }>({
  authTimeline: [
    async ({ context }, use) => {
      watchAuthRequests(context);
      await use();
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern
  account: async ({}, use) => {
    await use({ email: `user-${crypto.randomUUID()}@example.com`, password: "correct-horse-battery" });
  },
  // eslint-disable-next-line no-empty-pattern
  state: async ({}, use) => {
    await use({});
  },
  people: async ({ browser }: { browser: Browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use({
      newPerson: async () => {
        const context = await browser.newContext({ baseURL: origin });
        contexts.push(context);
        watchAuthRequests(context);
        return context.newPage();
      },
    });
    await Promise.all(contexts.map((c) => c.close()));
  },
});

export const { Given, When, Then } = createBdd(test);
