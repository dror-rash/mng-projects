# Task 124: "Needs action" on the overview

- **Status:** in-progress
- **Milestone:** M22 Guided project flow
- **Zone / package:** `apps/dashboard` (`app/page.tsx`, `features/projects`, `messages/`), `e2e`
- **Feature file:** `docs/features/needs-action.feature` (`@task:124`; a file of its own, since `dashboard-home.feature` carries `@task:009` and a Background on every scenario)
- **Depends on:** task 120 (done, PR #124): `whoseMove`, `checklistFor`, `whoseMoveLabelKey` (`stage-checklist.ts`) and the `project_checklist_tick` rows. Task 123 (done, PR #126), reused as is: `listChecklistTicksForProjects(userId, workspaceId, projectIds)` (`checklist-queries.ts`, each tick's project, item and `tickedAt`, only the workspace's visible, not deleted projects), `listStageChangedAt(userId, workspaceId, projectIds)` (`stage-history.ts`), and in `stage-board.ts` `stageSince`, `daysInStage`, `LONG_WAIT_DAYS` / `isLongWait` (the same 7 days) and `movesByProject`. Task 104's follow-ups join this section when 104 lands (see its scope).

## Why
The overview shows task counts, not the jobs that are stuck. The office wants to open the app and see which projects have waited on us, or on the customer, for too long.

## Scope
- **Overview, a "Needs action" section** (צריך טיפול, *default*) near the top, for everyone, listing only projects they can see (*default*: every role; workers see their crews' projects, partner users their partner's):
  - **"Our move"** (תורנו): active projects whose badge is Our move or Ready for next stage (*default*: the next step is ours either way) and that have waited more than 7 days;
  - **"Waiting for customer"** (ממתין ללקוח): active projects whose badge is Waiting for customer and that have waited more than 7 days.
  - "Waited" counts from the later of the day the current stage started (`stageSince`, as on the board) and the latest tick among the current stage's items (ADR-0014), in UTC days (`todayUtc()`, `daysInStage`). Ticks of other stages don't count (ticks stay with their stage when the project moves). So a project can show fewer days here than on the board, which counts from the stage's start only (ADR-0014).
  - Each entry: the project's name (a link), the customer's name, the stage and "{days} days" waiting; longest first; at most 10 per group, then "View all on the board" (to `/projects?view=board`, task 123).
  - Not listed: canceled projects, projects at Closed with the item done (Job complete).
  - Nothing to list: "Nothing needs action." ("אין כרגע מה לטפל.", *default*).
- **Follow-ups due** (task 104) is the third group of this section once task 104 lands; this task leaves room for it and doesn't build it.

## Out of scope
- Follow-ups (task 104).
- A setting for the 7 days (parking lot).
- Notifications or emails.

## Acceptance criteria
- [ ] Projects that waited more than 7 days show under "Our move" or "Waiting for customer"; recent, canceled and finished ones don't. ("Needs action lists the projects that waited too long")
- [ ] Ticking the customer's item restarts the wait, so the project leaves the list. ("A tick restarts the wait")
- [ ] A partner user and a crew worker see only their own projects in it. ("A partner user sees only their projects in Needs action", "A worker sees only their crew's projects in Needs action")
- [ ] With nothing to list the section says so. ("Nothing needs action")

## Security notes
- Reads projects, stage history and ticks under the existing policies. The overview is shared by every role, so the leak scenario checks a partner user and a worker against another partner's and an uncrewed project.
- Not a security-sensitive path; the `access-auditor` checks the query.

## Approach (brief)
- `waitingSince(stageChangedAt, ticks)` and `needsAction(projects, today)` as pure functions (unit), then the section (a server component) with a story.

## Test plan
- **Acceptance:** `needs-action.feature` (`@task:124`).
- **New steps:**
  - `the checklist item {string} of {string} was ticked {int} days ago` (Given).

  The two groups are regions named by their headings, so `the {string} section shows {string}` and `the {string} section does not show {string}` read them.
- **Step notes:**
  - The new tick step finds the project as `the checklist item {string} of {string} is ticked` does (the leak workspace's ids, else one of mine) and passes `ticked_at` as a UTC ISO string, like task 123's days-in-stage step (node-postgres sends a `Date` in the runner's local time).
  - `the project {string} is canceled` (task 050) reads only the leak workspace's ids (`idOf`); "Needs action lists the projects that waited too long" cancels a project of mine, so the step falls back to one of mine as `project-board.steps.ts`'s `projectId` does.
- **Reused:** `the project {string} has been at the stage {string} for {int} days` (task 123), `the project {string} is canceled`, `the page shows none of {string}`, `I open {string}`, `I tick {string}`, the two-partner background, `I am signed in as a worker`, `I am on the crew of {string}`.
- **Unit:** `needs-action.test.ts` (the wait from the stage or the current stage's latest tick, other stages' ticks ignored, the groups with Ready as our move, more than 7 days, longest first, the limit of 10, Closed complete, canceled).
- **Storybook:** `NeedsActionSection` (both groups, empty, more than 10, Hebrew).

## Open questions
None blocking. Defaults taken:
1. **N:** 7 days, fixed, "more than 7".
2. **Who sees it:** every role, each their own projects.
3. **"Ready for next stage"** counts as our move.
4. **The wait** counts from the later of the stage's start and its latest tick.
5. **At most 10 per group,** then a link to the board.

## Progress log
- 2026-11-15 – Drafted with `needs-action.feature` (`@wip`) (planner).
- 2026-11-16 – Readiness check against tasks 120 (PR #124) and 123 (PR #126) as merged: reuses 123's batch reads (with `workspaceId`) and `stage-board.ts` helpers; the wait counts only the current stage's ticks; step notes for the new tick step (UTC times) and `the project {string} is canceled` on a project of mine. Scenarios unchanged. READY (planner).
- 2026-11-16 – In progress in lane 2 (`feat/needs-action`, database `app_lane2`, shell http://localhost:3020).

## Parking lot
- A workspace setting for N.
- A count of "Needs action" in the side menu.
- Waiting on a supplier (materials, M18) as a third party.
