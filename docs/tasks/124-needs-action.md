# Task 124: "Needs action" on the overview

- **Status:** todo
- **Milestone:** M22 Guided project flow
- **Zone / package:** `apps/dashboard` (`app/page.tsx`, `features/projects`, `messages/`), `e2e`
- **Feature file:** `docs/features/needs-action.feature` (`@task:124`; a file of its own, since `dashboard-home.feature` carries `@task:009` and a Background on every scenario)
- **Depends on:** task 120 (`whoseMove`, ticks); task 123 (`listChecklistTicks` and `daysInStage`; or this task adds them if it runs first). Task 104's follow-ups join this section when 104 lands (see its scope).

## Why
The overview shows task counts, not the jobs that are stuck. The office wants to open the app and see which projects have waited on us, or on the customer, for too long.

## Scope
- **Overview, a "Needs action" section** (צריך טיפול, *default*) near the top, for everyone, listing only projects they can see (*default*: every role; workers see their crews' projects, partner users their partner's):
  - **"Our move"** (תורנו): active projects whose badge is Our move or Ready for next stage (*default*: the next step is ours either way) and that have waited more than 7 days;
  - **"Waiting for customer"** (ממתין ללקוח): active projects whose badge is Waiting for customer and that have waited more than 7 days.
  - "Waited" counts from the later of the day the current stage started and the latest tick among its items (ADR-0014), in UTC days (`todayUtc()`).
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
- **Reused:** `the project {string} has been at the stage {string} for {int} days` (task 123), `the project {string} is canceled`, `the page shows none of {string}`, `I open {string}`, `I tick {string}`, the two-partner background, `I am signed in as a worker`, `I am on the crew of {string}`.
- **Unit:** `needs-action.test.ts` (the wait, the groups, the limit, Closed, canceled).
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

## Parking lot
- A workspace setting for N.
- A count of "Needs action" in the side menu.
- Waiting on a supplier (materials, M18) as a third party.
