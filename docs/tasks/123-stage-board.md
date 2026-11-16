# Task 123: Stage board view of the projects list

- **Status:** in-progress
- **Milestone:** M22 Guided project flow
- **Zone / package:** `apps/dashboard` (`app/projects`, `features/projects`, `messages/`), `e2e`
- **Feature file:** `docs/features/project-board.feature` (`@task:123`; a file of its own, since `project-list.feature` carries `@task:043` and a Background on every scenario)
- **Depends on:** task 120 (done, PR #124): `whoseMove`, `whoseMoveLabelKey` and `whoseMoveChartSlot` (`stage-checklist.ts`, the badge's text and colour as on the "Next step" card), and the `project_checklist_tick` rows. Can run in parallel with tasks 121 and 122 (different pages); `STAGE_PHASES` is shared with task 121: whichever of the two runs first adds it to `project-stage.ts` with its labels, the other reuses it.

## Why
The office wants to see the whole pipeline at once: which jobs sit at each stage, whose move each is, and which have been stuck too long.

## Scope
- **All projects** gets a third view next to "Table" and "Tiles": a "Board" link (לוח, *default*), `?view=board`, kept with the filters like the other views (task 043).
- **Columns:** one per stage in flow order under its phase heading (Sales, Work, Closing, `STAGE_PHASES`). Each column is a region named by its stage with the count (like the task board, task 005), listing its projects; an empty column says "No projects" (אין פרויקטים).
- **Cards:** the project's name (a link to its page), the customer's name (as text for partners, as in the table), the whose-move badge (task 120), and the days in the current stage: "{days, plural, one {1 day} other {# days}}" since the stage started (`todayUtc()`, the latest stage change or the project's creation, as task 101's "since").
  - More than 7 days: the count is red and carries "more than 7 days in this stage" for screen readers (*default* wording; colour is never the only signal).
  - A canceled project shows "Canceled" instead of the badge (*default*).
- **Order in a column:** longest in the stage first (*default*); the table's sort doesn't apply.
- **Filters:** customer, status, stage, overdue and search apply to the board as to the table; the stage filter leaves the other columns empty.
- **Phone (360 px):** the columns scroll inside the board; the page itself doesn't scroll sideways. Right to left in Hebrew.
- **Query:** one query for the listed projects' ticks, `listChecklistTicksForProjects(userId, projectIds)` in `checklist-queries.ts` next to task 120's per-project `listChecklistTicks(userId, projectId)` (same RLS, inside `withAccess`), returning each tick's project, item and time, grouped in code; reused by task 124.

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
- **Step notes:** `the {string} column lists {string}` (task 005) reads every link in a column's list items; a board card's customer is a link too for admins (as in the tiles), so the step takes each item's first link, the project (the task board's cards have one link, so its scenarios read the same). Columns are regions, not list items, so `the {string} project card shows {string}` finds the card alone.
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
- 2026-11-16 – Readiness check against task 120 as merged (PR #124): the query renamed `listChecklistTicksForProjects` (task 120 already has `listChecklistTicks` for one project); `STAGE_PHASES` shared with task 121; step notes for the board's cards. READY (planner).
- 2026-11-16 – In progress in lane 2 (`feat/stage-board`, database `app_lane2`, shell http://localhost:3020).
- 2026-11-16 – Steps written, `@wip` off; red run: all 5 scenarios fail on the missing board (no "Board" link, no stage column regions). `the {string} column lists {string}` now reads each item's first link (task 018's scenarios still pass) (spec-writer).
- 2026-11-16 – Implemented (implementer): `STAGE_PHASES` added to `project-stage.ts` (labels in `projectStage.phase`; task 121 reuses it), `view=board`, `listChecklistTicksForProjects` and `listStageChangedAt` (one query each, only for the board), `stage-board.ts` (pure), `stageBoard()` (text), `StageBoard` with its story, `WhoseMoveBadge` shared with the Next step card. The days-in-stage step also moves the project's earlier history rows back: its first stage row (from the new-project form, dated now) was newer than the backdated change, so the card said 0 days. The unit and DB tests went in with the `feat` commit, not in a `test:` commit of their own: the commit guard runs lint and typecheck, and a test importing code that doesn't exist yet fails typecheck. Their red was observed by running each file before writing the code it tests: `stage-board.test.ts`, `stage-board-view.test.tsx` and `stage-board-data.test.ts` failed on the missing modules, the phases and board-view cases on the missing `STAGE_PHASES` and `board` view, and the two DB queries' cases on the missing functions. `@task:123` 5/5; project list (`@task:043`, `@task:045`) and the checklist (`@task:120`) 23/23; unit 561 in the dashboard.
- 2026-11-16 – Review fixes (implementer): both batch reads take the `workspaceId` and join `project` under `visibleProjects` (workspace, not deleted, `can_see_project`): RLS alone gave an admin the ticks and stage changes of a deleted project and of another workspace's project they also administer (`stage-board-queries.db.test.ts`; red first with the new signature and no join, 2 of 6 failing on exactly those; a partner B user already got nothing for partner A's project and the test keeps it so). The long-wait text takes its number from `LONG_WAIT_DAYS`; a tie in days sorts by name (unit test red first); the Phone story's check fails if the board doesn't scroll or its 360 px wrapper does; `the {string} column lists {string}` takes each item's first link by role; a `WhoseMoveBadge` story with its four states. The DB fixture and the days-in-stage step pass UTC ISO strings: node-postgres sends a `Date` in the runner's local time, which a `timestamp` column keeps as is (two hours off on this machine; near midnight UTC that changes the day). An empty filter result shows "No projects match these filters." as in the table and tiles, not eight empty columns.

## Parking lot
- Drag a card to another column to move its stage (owner-approved to park; it would go through `changeStageAction`).
- A workspace setting for the 7 days.
- Board columns collapsed by phase on phones.
- Translate the rest of All projects ("All projects", Table, Tiles, the filters and counts): only the board's text is in the catalogue, so in Hebrew "לוח" sits next to English links. With the translation work of tasks 097–100.
- The commit guard runs lint and typecheck on the working tree, not the staged tree, so commits made in quick succession aren't each checked on their own content (for a future guard task).
