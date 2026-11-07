# Task 069: The POC flow, end to end on the deployed app

- **Status:** in-progress
- **Milestone:** POC (2026-11-13)
- **Zone / package:** `e2e` (steps), `.github/workflows/deploy.yml` (the preview's tag selection)
- **Feature file:** `docs/features/poc-flow.feature`
- **Depends on:** tasks 056, 057, 058, 059, 060, 061, 064, 068, and 070–072 (the flow walks customer → site → project, 2026-11-04). All done.

## Why
The POC is one story that a viewer can follow, from a customer to a report, on a public URL. This task proves that the story works as a whole, not just piece by piece.

## Scope
- **One long scenario** (`@poc`) with an admin ("I"), a worker and a partner user, each a new account:
  - **Admin:**
    - creates a customer ("Acme Ltd") with a sub-company ("Acme Retail");
    - adds a site ("Dizengoff store") to the sub-company, with an on-site contact ("Yossi Mizrahi");
    - creates a project ("Store wiring") from the site's page, with two tasks;
    - publishes a reading form ("Panel check": Voltage, Cable condition);
    - invites the worker (a "Worker" invite link) and puts them on the project's crew.
  - **Worker** (in their own browser):
    - opens the project and sees its site and on-site contact;
    - records a site visit with notes;
    - adds a photo to the visit;
    - fills the reading on the visit;
    - moves a task to Done.
  - **Admin again:**
    - uploads a report and downloads it;
    - sees the visit, the photo (it opens as an image), the reading (with its value and the worker's name), the task in Done and the report on the project.
  - **Partner** (a short check; the leak suite covers the details):
    - the admin creates the partner "Northwind", assigns it "Acme Ltd › Acme Retail", creates the partner's project ("Shelf lighting") at the same site, and invites a partner user;
    - the partner user's projects are only "Shelf lighting"; they see its site and on-site contact, none of our project, task or visit, and our project's address is "Project not found".
- **Runs:** locally (CI's `e2e` job, like every other scenario) and against the deployed preview (`BASE_URL`), where the preview job runs `@smoke or @poc`.
- **App-only steps.** Against the preview a CI runner has only `BASE_URL`: no `@repo/db/maintenance`, no storage credentials. So every step of the scenario goes through the app's pages and Better Auth's API (uploads and downloads go through the URLs the app signs, as a browser's do). Existing steps that read or write the database (`myRecordId`, `insertCustomerWithSite`, the leak workspace) are not used.
- **Sign-up rate limit (task 068, 2026-11-04).** Better Auth allows 3 requests per 10 seconds per IP on `/sign-up*` (and on `/sign-in*`), counting from the last request: a request at least 10 seconds after the previous one starts the count again. Previews run without `AUTH_DISABLE_RATE_LIMIT` (rule 13), and `@smoke` already sends 3 sign-ups. `@poc` adds 3 (admin, worker, partner user), the fewest the story allows (three roles, three people).
  - **Approach: spacing.** When `BASE_URL` is set, the e2e helpers wait so that no sign-up or sign-in request goes out within 10 seconds (plus a margin) of the previous one to the same path in the run. The preview job runs one worker (`--workers=1`), so one timeline in the process is enough. Every API sign-up and sign-in in the steps goes through that pacing (`signUp`, "I am signed in with an existing account", "an existing account"); the UI sign-up and log-in of the `@smoke` scenarios are recorded in the same timeline (for example by watching the page's requests), so the first `@poc` sign-up also waits for them. Locally the limit is off and nothing waits.
  - Not chosen: replacing `@smoke` sign-ups (`@smoke` checks the sign-up and log-in pages, which `@poc` doesn't); any flag or header that lifts the limit on a deployment (rule 13).
- **Timeout.** The scenario carries `@timeout:240000` (playwright-bdd's special tag): it runs about 90 steps, three paced sign-ups (about 30 seconds) and uploads, against Cloud Run, well past Playwright's 30-second default.

## Out of scope
- Offline capture (tasks 062–063) and the generated PDF report (task 065): after the POC.
- Demo data on the deployed app (`seed:demo` with visits, readings and a report, and how it reaches the deployed database): task 076.
- More `@poc` scenarios, or moving piece-level scenarios into the preview set.

## Acceptance criteria
- [ ] The `@poc` flow passes locally (CI's `e2e` job). Scenario: "An admin sets up the work, a worker does it on site, the admin adds the report, and a partner sees only their own".
- [ ] The same scenario passes against the PR's preview URL in the deploy job, after `@smoke`, without hitting the sign-up limit. Same scenario, run with `E2E_TAGS="@smoke or @poc"`.
- [ ] Every step it uses goes through the app only: run against the preview, with no `DATABASE_URL` or storage settings on the runner. Same scenario, preview run.
- [ ] The partner user sees only their own project and its site. The partner part of the same scenario.

(The second criterion of the earlier draft, "the demo account on the deployed app shows the whole flow", moved to task 076.)

## Approach (brief)
- **Feature:** `docs/features/poc-flow.feature`, one scenario. Most steps are the existing generic ones (`I open`, `I follow the … link`, `I fill in`, `I press`, `I select … from …`, `the … section shows …`) and existing app-only steps:
  - `I am signed in with an existing account`, `the project has a task {string}`, `I am on the {string} project page`;
  - `I have a published reading form {string} with the fields:` (task 060 built it through the pages for this task);
  - `I create an invite link for the role {string}`, `I have a partner {string} with the customer {string}`;
  - `I add the file {string} with {string}`, `the reports listed are {string}`, `the report {string} downloads as {string}`, `the visits listed are {string}`, `the {string} section shows the photo {string}`, `the photo {string} opens as an image`, `the readings listed are {string}`, `the task {string} is in the {string} column`, `I follow the {string} link in the {string} section`.
- **New steps (spec-writer), all through the app only**, in a new `e2e/steps/poc-flow.steps.ts`. The worker and the partner user each get their own browser from the `people` fixture, kept in the scenario state under their role:
  - `the worker {string} joins with the invite link` and `the partner user {string} joins with the invite link`: sign up a new person with that name (paced), open the kept invite link, press "Join workspace", land on `/dashboard`;
  - `the worker opens the {string} project` and `the partner user opens the {string} project`: from All projects, follow the project's link;
  - `the worker sees the text {string}`, `the partner user sees the text {string}`, `the partner user sees the heading {string}`;
  - `the worker records a visit with the notes {string}`: on the project page, "Record a visit", fill Notes, "Save visit", wait for the visit's page;
  - `the worker adds the photo {string} to the visit`: on the visit's page, "Add photos" (the same upload as `I add the photo … with …`);
  - `the worker fills in the {string} reading on the visit with {string} as {string}`: on the visit's page, "Add a reading", the form's link, the field, "Save reading", wait for the reading's page;
  - `the worker moves the task {string} to {string}`: on the project page, the card's "Move to …" button;
  - `the partner user follows the {string} link`;
  - `the partner user's projects are {string}`: the links on All projects;
  - `the partner user's page shows none of {string}`;
  - `the partner user can't open the {string} project`: I open it from All projects, the partner user opens the same address and sees "Project not found" (like `the teammate can no longer open the {string} project`).
- **Pacing:** a helper in `e2e/steps/fixtures.ts` used by every sign-up and sign-in (see Scope). It does nothing without `BASE_URL`.
- **Preview job:** `deploy.yml`'s Playwright step runs `E2E_TAGS: "@smoke or @poc"` (the comment above it updated). Still one worker and no published traces.
- **Hand checks this closes for task 068** (on this task's PR preview, recorded in 068's log): an upload and download on a preview (the photo and the report now do it in the run), and, after the run, that the shell's and dashboard's Cloud Run logs hold no invite-link paths (the scenario opens two invite links).
- No new ADR; no migration; no application code expected. If a step shows a bug in the app, it is fixed in this task with its own unit test.

## Test plan
- Acceptance: `docs/features/poc-flow.feature`, locally (`pnpm test:e2e`, and `E2E_TAGS=@poc pnpm test:e2e`), in CI's `e2e` job, and against the PR's preview (`BASE_URL=<preview shell URL> E2E_TAGS="@smoke or @poc"`, one worker).
- Rate limit: the preview run itself (no 429 from `/api/auth/sign-up/email`); locally, a run with `BASE_URL` pointing at local servers started without `AUTH_DISABLE_RATE_LIMIT` shows the pacing working.
- Unit: the pacing helper (waits only when `BASE_URL` is set; waits until 10 s plus margin after the previous request to the same path; no wait for a different path), with a fake clock.
- Storybook: none (no UI changes).

## Progress log
- 2026-11-02 – Planned. The owner agreed to leave offline capture and the generated report out of the POC.
- 2026-11-04 – Noted the preview limits found in task 068: the sign-up rate limit (`@smoke` already uses all 3 sign-ups per 10 seconds) and no direct database access from the preview run.
- 2026-11-07 – Feature file written (`poc-flow.feature`, one `@poc` scenario, `@wip`), scope made concrete (names, the partner's project at the same site), the steps that must be app-only listed, the rate-limit approach chosen (pacing when `BASE_URL` is set, `@smoke` kept), and the preview job's tags set to `@smoke or @poc`. Demo data on the deployed app moved to task 076: it needs a decision on how a seed reaches the deployed database through CI (identities and possibly Terraform), which doesn't belong in an e2e change.
- 2026-11-07 – Started in lane 1 (`feat/poc-flow`).
- 2026-11-07 – `test:` commit: `@wip` off; the 15 app-only steps in `e2e/steps/poc-flow.steps.ts` (the worker and the partner user each in their own browser from `people`, kept under `state.roles`); the sign-up pacing in `e2e/support/pacing.ts` (unit test `pacing.test.ts`, fake clock; `pnpm --filter @repo/e2e test`), used by `fixtures.ts` for every API sign-up and sign-in (`signUp`, `authPost`) and waited on before the sign-up and log-in pages' buttons, with every browser context's sign-up/sign-in responses recorded on the same timeline; `deploy.yml` runs `@smoke or @poc`. **Red run (`E2E_TAGS="@task:069"`, 1 worker): it passes straight away (41 s)**: every piece the flow walks through already exists, so there is no red step and no application code to write. `@smoke` passes locally (3/3). A run with `BASE_URL=http://localhost:3010` against the lane's dev servers (`@smoke or @poc`, 4/4, 1.3 min) shows the pacing waiting (the `@smoke` scenarios after the UI sign-up take about 11 s instead of 2–4 s); the dev servers don't rate limit, so the 429 check is the preview run.

## Parking lot
- Run `@poc` against `main` after each deploy too (needs a decision on throwaway accounts in the production database; today they would accumulate there).
- Clean up the throwaway `@example.com` accounts and workspaces the preview runs leave in `app_preview`.
