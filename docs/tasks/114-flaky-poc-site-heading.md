# Task 114: Flaky `@poc` flow on the preview: the new site's heading doesn't show

- **Status:** todo
- **Milestone:** unscheduled (test health; found on PR #103's preview)
- **Zone / package:** `e2e` (steps), possibly `apps/dashboard` (`features/sites`) if a redirect is really lost
- **Feature file:** `docs/features/poc-flow.feature` (behavior unchanged)
- **Depends on:** nothing open. Related: task 066 (flaky task-assignees scenarios under local load; same `I press` wait).

## Why
Flaky tests are bugs (CLAUDE.md). The `@poc` flow gates every PR preview. It failed once on a change that couldn't affect it, so a red preview no longer means a broken app.

Evidence:
- PR #103's **Deploy** run 43591431997, attempt 1 (2026-11-14, 11:51 UTC), failed "The POC flow, from a customer to a report › An admin sets up the work, a worker does it on site, the admin adds the report, and a partner sees only their own" at `Then I see the heading "Dizengoff store"` (`e2e/steps/common.steps.ts:36`): element not found within the 15 s expect timeout.
- Attempt 2 of the same run passed 4/4 with no code change.
- #103 changed only `scripts/` and docs. The previews of #97 and #101 passed.
- All previews share one database (`app_preview`), and each run starts on a cold Cloud Run revision.

## What the failing step waits for
The steps right before the failure:
1. `I follow the "New site" link` (`followLink`) clicks the link and waits until the URL ends in `/sites/new?customer=<id>`.
2. `I fill in "Site name" …` / `"Address" …` call `getByLabel(...).fill(...)` with no wait for hydration.
3. `I press "Save site"` clicks the button and waits for **any** POST response (`response.request().method() === "POST"`), not specifically the server action's own response or the navigation after it.
4. `createSiteAction` (`apps/dashboard/features/sites/actions.ts`) inserts the site inside `withAccess`, calls `revalidateSite(id)` and `redirect("/sites/<id>")`. Invalid input returns `FormState` instead: the form stays on `/sites/new` with "Site name is required" under the field.
5. `Then I see the heading "Dizengoff store"` waits up to 15 s (deployed) for a visible `heading` role named "Dizengoff store". Only the site page's `<h1>{site.name}</h1>` (`apps/dashboard/app/sites/[siteId]/page.tsx`) matches. The new-site page's heading is "New site for Acme Ltd › Acme Retail".

So the failure means that 15 s after a POST response, the browser was not on a rendered site page for that site.

## Likely causes to investigate
1. **The wait catches the wrong POST, or doesn't wait for the navigation.** `I press` returns on the first POST response. The action's redirect navigation (and the RSC render of `/sites/<id>` on the server: contacts, projects, task counts, `recordWorkspace`) can take longer than the 15 s heading wait on a cold or busy instance. Check the result of the redirect, not just the response.
2. **Fill or click before hydration on a cold instance.** On a slow first load of `/sites/new` (`SiteForm` is a `"use client"` form with `useActionState`), Playwright may fill or click before React hydrates. Check whether values are lost (the action then returns "Site name is required", and the page stays on `/sites/new`) or the submit goes as a plain form post with a different response sequence.
3. **Cold start or a slow server render.** The redirect target renders four queries plus the header. A cold dashboard instance, a second instance starting, or a slow Cloud SQL connection (shared by `app`, `app_preview` and every open preview) could push it past 15 s. Look for a 5xx or the error boundary instead of the page.
4. **A page that needs a reload.** Check whether the redirect can land on a stale cached RSC payload (router cache or `revalidateSite`) that shows something other than the new site until reloaded.
5. **Data or load from parallel previews.** Every scenario signs up fresh accounts in its own workspace, so record collisions are unlikely (RLS scopes "Dizengoff store" per workspace). Concurrent deploys on `app_preview`, such as another PR's migration or its `@smoke` run, could still slow or lock queries. Check which other **Deploy** runs overlapped 11:51 UTC.

Rule out each cause with evidence (logs, a reproduction, or a reasoned "can't happen" from the code) before picking a fix.

## Scope
1. **Gather the evidence that exists:** the job log of run 43591431997 attempt 1, the dashboard preview service's request and error logs around 11:51 UTC (open question 3), and the **Deploy** runs that overlapped it.
2. **Reproduce:**
   - Against a preview: `BASE_URL=<preview shell URL> E2E_TAGS="@poc and not @wip" pnpm exec playwright test --workers=1 --repeat-each=<n>` from `e2e/` (open question 4). Sign-up pacing is already in `e2e/steps/fixtures.ts`.
   - Locally under load: production build (`pnpm build`, then the e2e servers in `start` mode), the `@poc` scenario with `--repeat-each=10`, alongside the full suite or CPU throttling (`page.route` delays, or CDP `Emulation.setCPUThrottlingRate`). Read the `retain-on-failure` traces.
3. **Fix the cause:**
   - most likely in the steps: `I press` waits for the right signal, the action's response and then the URL or the next page;
   - or `I fill in` / `I press` wait until the form is interactive;
   - or in the app, if a redirect or render is really lost (then a failing test first, rule 1).
   - If the fix changes the shared `I press` step or `pressAndWait`, the full local suite must stay green.
4. **Optional, depending on open question 2:** when a step fails against a deployment, print the page's URL and visible headings to the CI log so the next failure can be diagnosed without traces.

## Out of scope
- Changing any scenario in `poc-flow.feature` (rule 2), or splitting it.
- Retries (`retries` stays `0`), or a longer timeout as the only fix.
- Turning traces on in the preview job (the repository is public; traces hold throwaway passwords and cookies).
- `min_instances` or other Cloud Run scaling changes for previews (an `infra/` change; parking lot).
- Task 066's local task-assignees flakiness, unless the same fix covers it (then note it there).

## Acceptance criteria
- [ ] The task records the cause found, with its evidence (log lines, a trace from a local reproduction, or a reasoned elimination of each cause above).
- [ ] With the fix, the `@poc` scenario passes N consecutive PR preview **Deploy** runs (N from open question 1; proposed 5), counting re-runs of the same run, with no failure in between.
- [ ] Locally, the `@poc` scenario passes `--repeat-each=10` under the load setup that reproduced the failure (or that was used to try to reproduce it).
- [ ] No `retries`, no longer test or expect timeout as the only change, and no `@poc` scenario edited (CLAUDE.md: "flaky tests are bugs: fix or delete, never retry-and-ignore").
- [ ] `pnpm test:e2e` stays green locally if a shared step (`I press`, `I fill in`, `pressAndWait`, `followLink`) changed.

## Security notes
Touches only e2e steps, and possibly the site action if a real app bug turns up. Reproducing against a preview creates throwaway accounts and records in `app_preview` (throwaway data, register SEC-40). Rate limits stay on (rule 13): one worker, existing sign-up pacing. Anything printed to the public CI log must not include passwords, cookies or invite tokens (open question 2). The `security-reviewer` runs only if the fix touches `features/sites/actions.ts`, `withAccess` or auth code, or adds diagnostics to `deploy.yml`.

## Approach (brief)
Start with the job log and the Cloud Run logs for 11:51 UTC: a 5xx, a slow request or an error-boundary render points at the app or the infrastructure; nothing there points at the step's waits. Then reproduce locally under load with traces on. The smallest likely fix: `I press` waits for the server action's own response (a POST to the current page carrying the `Next-Action` header), and a "then I see …" step after a redirect is expected to wait for the target URL. No ADR expected.

## Test plan
- Acceptance: the existing `@poc` scenario, repeated locally and on N preview runs; the full local suite if a shared step changes.
- Unit/component: none, unless an app bug is found (then a failing test for it first).
- Storybook: none.

## Progress log
- 2026-11-14 – Drafted from PR #103's preview run 43591431997 (attempt 1 failed at the "Dizengoff store" heading, attempt 2 passed 4/4).
- 2026-11-14 – Owner answered questions 2–4 (diagnostics in the CI log: yes; the owner reads the Cloud Run logs; workstation runs against a preview: yes); question 1 takes the default, 5. READY.

## Open questions
1. How many consecutive green preview runs of the `@poc` scenario count as fixed? This draft proposes 5, the count task 066 used. **Answer:** 5 (the default; the owner didn't object, 2026-11-14).
2. The repository is public and CI keeps traces off. May a failing step print the page's URL and its visible headings and error texts to the CI log? Those can include the throwaway account's email and workspace name, but no passwords or cookies. **Answer (owner, 2026-11-14):** yes.
3. Who reads the dashboard preview service's Cloud Run logs and request log for run 43591431997 (around 11:51 UTC, 2026-11-14): the owner, or an agent with read-only `gcloud logging read` access? **Answer (owner, 2026-11-14):** the owner reads them for now.
4. May an implementer run the `@poc` scenario repeatedly from a workstation against a PR preview (`BASE_URL`, one worker)? Each run signs up 3 new accounts on `app_preview` under production rate limits. Or should reproduction against a deployment happen only through re-runs of the **Deploy** workflow? **Answer (owner, 2026-11-14):** yes, from a workstation, one worker.

## Parking lot
- `min_instances = 1` for the preview dashboard service, to remove cold starts from preview runs (cost; `infra/`).
- A shared "submit and wait for the action's navigation" helper replacing both `I press` and `pressAndWait` (`e2e/steps/workspaces.steps.ts`), if the fix doesn't already do it.
- Separate preview databases per PR (task 110's open question 1, option C) if cause 5 turns out to matter.
