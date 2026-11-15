# Task 123: Stage board view of the projects list

- **Status:** todo
- **Milestone:** M22 Guided project flow
- **Zone / package:** `apps/dashboard` (`app/projects`, `features/projects`, `messages/`), `e2e`
- **Feature file:** `docs/features/project-board.feature` (`@task:123`; a file of its own, since `project-list.feature` carries `@task:043` and a Background on every scenario)
- **Depends on:** task 120 (`whoseMove` and the ticks); can run in parallel with tasks 121 and 122 (different pages)

## Why
The office wants to see the whole pipeline at once: which jobs sit at each stage, whose move each is, and which have been stuck too long.

## Scope
- **All projects** gets a third view next to "Table" and "Tiles": a "Board" link (לוח, *default*), `?view=board`, kept with the filters like the other views (task 043).
- **Columns:** one per stage in flow order under its phase heading (Sales, Work, Closing, task 121's `STAGE_PHASES`). Each column is a region named by its stage with the count (like the task board, task 005), listing its projects; an empty column says "No projects" (אין פרויקטים).
- **Cards:** the project's name (a link to its page), the customer's name (as text for partners, as in the table), the whose-move badge (task 120), and the days in the current stage: "{days, plural, one {1 day} other {# days}}" since the stage started (`todayUtc()`, the latest stage change or the project's creation, as task 101's "since").
  - More than 7 days: the count is red and carries "more than 7 days in this stage" for screen readers (*default* wording; colour is never the only signal).
  - A canceled project shows "Canceled" instead of the badge (*default*).
- **Order in a column:** longest in the stage first (*default*); the table's sort doesn't apply.
- **Filters:** customer, status, stage, overdue and search apply to the board as to the table; the stage filter leaves the other columns empty.
- **Phone (360 px):** the columns scroll inside the board; the page itself doesn't scroll sideways. Right to left in Hebrew.
- **Query:** one `listChecklistTicks(userId, workspaceId)` for the listed projects (in `features/projects/`, inside `withAccess`), grouped in code; reused by task 124.

## Out of scope
- Moving a project by dragging a card (parking lot, owner-approved).
- A setting for the 7 days.
- The board on the customer page.

## Acceptance criteria
- [ ] The board shows a column per stage under its phase, each listing its projects. ("The board shows a column per stage")
- [ ] A card shows the customer, whose move it is and the days in the stage, marked after 7 days; longest first. ("A board card shows whose move and how long")
- [ ] Filters apply to the board and are kept when switching views. ("The board keeps the filters")
- [ ] A partner user's board shows only their partner's projects. ("A partner's board shows only their projects")
- [ ] On a phone the page doesn't scroll sideways. ("The board on a phone")

## Security notes
- Reads only what the table reads, plus ticks under `can_see_project` (RLS). The risk is a count or card of a project the person can't see: the leak scenario checks a partner user's board.
- Not a security-sensitive path; the `access-auditor` checks the new query.

## Approach (brief)
- `parseProjectFilters` accepts `view=board` (unit).
- `daysInStage` and the column grouping as pure functions (unit), then `StageBoard` in `features/projects/` with a story.

## Test plan
- **Acceptance:** `project-board.feature` (`@task:123`).
- **New steps:**
  - `the project {string} has been at the stage {string} for {int} days` (Given: stage and history row dated that many days ago, UTC);
  - `the board's phases are {string}`;
  - `the {string} column is empty` ("No projects"; the column's name carries its count);
  - `the {string} project card does not show {string}`.
- **Reused:** `I follow the {string} link`, `the {string} column lists {string}`, `the {string} project card shows {string}`, `I select {string} from {string}`, `I do not see the {string} link`, `the checklist item {string} of {string} is ticked`, `my screen is {int} pixels wide`, `the page does not scroll sideways`, the two-partner background, `the page shows none of {string}`.
- **Unit:** `project-filters.test.ts` (board view), `stage-board.test.ts` (grouping, order, days, the 7-day mark).
- **Storybook:** `StageBoard` (full, empty columns, long waits, canceled, Hebrew, phone).

## Open questions
None blocking. Defaults taken:
1. **The 7-day mark:** more than 7 days (8 and up), fixed.
2. **Order in a column:** longest in the stage first.
3. **Canceled projects:** shown, with "Canceled" in place of the badge, unless the status filter hides them.
4. **The view's name:** "Board" לוח.

## Progress log
- 2026-11-15 – Drafted with `project-board.feature` (`@wip`) (planner).

## Parking lot
- Drag a card to another column to move its stage (owner-approved to park; it would go through `changeStageAction`).
- A workspace setting for the 7 days.
- Board columns collapsed by phase on phones.
