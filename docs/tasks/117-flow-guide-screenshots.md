# Task 117: Screenshots of the customer project flow, for the usage guide

- **Status:** in-review
- **Milestone:** unscheduled (tooling; owner request 2026-11-14)
- **Zone / package:** `e2e/scripts/flow-guide.mjs`, `e2e/package.json`, `.gitignore`, `CLAUDE.md`
- **Feature file:** none (a script against running dev servers, like `e2e/scripts/screenshots.mjs`; the behavior it walks through is covered by `poc-flow.feature` and the features of tasks 053–061 and 064)
- **Depends on:** nothing open.

## Why
The owner wants the 12-step project flow (`docs/PLAN.md`, "Target flow") shown as a guide with a screenshot of every screen used, and refreshed as milestones M15–M20 land. A script makes the guide repeatable instead of hand-made.

## Scope
- `pnpm --filter @repo/e2e flow-guide` runs a headless browser against running dev servers (`BASE_URL`, or `SHELL_PORT`, default 3000): an office admin and a field worker, throwaway `@example.com` accounts with fictional data, walk steps 1, 5, 7, 8, 10, 11 and 12 and the overview pages. It writes one PNG per screen and `manifest.json` (id, funnel step, title, caption, who) to `e2e/flow-guide/` (or `OUT`), git-ignored.
- The script makes its own sample files in the browser (a site photo as JPEG, two one-page PDF reports), so it needs nothing outside the repo.
- Sign-ups are spaced 11 seconds apart, so it runs with the auth rate limit on (rule 13).
- A failing part is recorded in the manifest and the run goes on.

## Out of scope
- Screens for steps 2, 3, 4, 6 and 9: they don't exist yet (M15, M16, M18, M19). Add their parts when those tasks land.
- Publishing the guide page (done by hand from the manifest).
- Running it in CI.

## Acceptance criteria
- [x] Against lane 1 (`BASE_URL=http://localhost:3010`): 26 screenshots, 0 failed.
- [x] `eslint` passes on the script.

## Parking lot
- Hebrew screenshots once M14's translations land (097–100).
- `AGENTS.md` had drifted from `CLAUDE.md` before this task (read order, storage and reset commands); bring it back in sync, or make it a symlink as `CLAUDE.md` says.

## Log
- 2026-11-14 – Script written and run on lane 1 (26 shots, 0 failed); guide published as a private artifact.
