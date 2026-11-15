# Task 101: Project stages

- **Status:** in-review
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `packages/db`, `apps/dashboard` (`features/projects`), `e2e`
- **Feature file:** `docs/features/project-stages.feature` (`@task:101`)
- **Depends on:** ADR-0012 accepted (owner); task 094 (new text goes into the catalogues in both languages)

## Why
The owner's flow (PLAN "Target flow", steps 1–10) needs one answer to "where is this job": inquiry, quote, ordered, and on to closed.

## Scope
- **Migration (one):**
  - `project.stage` text not null, default `'inquiry'`, check on the eight stages (ADR-0012); existing rows set to `'in_work'`;
  - `project_stage_change` (`id`, `project_id` → project on delete cascade, `from_stage` (null for the first), `to_stage`, `changed_by` → user on delete set null, `changed_at`), index on (`project_id`, `changed_at`);
  - RLS: select with `can_see_project`, insert with `can_change_project`; no update or delete grant;
  - `rls-pins.mjs` updated.
- **`features/projects/project-stage.ts`:** `PROJECT_STAGES` (inquiry, quote, ordered, scheduled, in_work, reporting, billing, closed), `parseProjectStage`, labels in the catalogues: Inquiry פנייה, Quote הצעת מחיר, Ordered הוזמן, Scheduled מתואם, In work בביצוע, Reporting דוחות, Billing חיוב, Closed סגור. Unknown stored values show as Inquiry.
- **Project page:**
  - a "Stage" select with a "Change stage" button for those who can change the project (admins; partner users on their partner's projects);
  - the line "<Stage> since <date>" for everyone who sees the project;
  - error "Choose a stage" (missing or unknown value).
- **New project form:** a "Stage" select, default "Inquiry". **Edit project:** the stage isn't on the form (it changes on the project page, so it gets a history row).
- **Projects table:** a "Stage" column, a "Stage" filter ("Any stage" plus the eight), sortable in stage order; kept in the URL like the other filters.
- **Copy:** the copy starts at Inquiry (*my call*). **Cancel/reopen** don't touch the stage.
- **Demo seed:** demo projects spread over the stages.

## Out of scope
- Automatic stage moves (later milestones offer them as explicit actions).
- Stage counts on the overview (parking lot).
- Renaming the "Status" column to "Progress" (parking lot, owner).
- The timeline (task 108).

## Acceptance criteria
- [x] An admin moves a project from Inquiry to Quote and sees "Quote since <today>". ("I move a project to the next stage")
- [x] A stage can move back. ("A stage can go back")
- [x] The projects table shows and filters by stage; a canceled project keeps its stage. ("The projects table shows and filters by stage", "A canceled project keeps its stage")
- [x] New projects start at Inquiry unless another stage is chosen. ("A new project starts at Inquiry")
- [x] Workers and auditors see the stage but can't change it; a partner changes their own project's stage; another partner's stage change is refused like a made-up id. ("Who can change a stage", "A worker sees the stage but can't change it", "Another partner's project's stage can't be changed")
- [x] A made-up stage value is refused. ("A made-up stage is refused")

## Security notes
- New table and column on projects. Writes go through `requireProjectChange` and RLS (`can_change_project`); reads through `can_see_project`.
- The history is append-only (grants test).
- Leak scenarios: a worker and an auditor have no change form; a partner posting a stage change for another partner's project gets the made-up-id refusal.
- Migration with grants and policies, so the `security-reviewer` runs.
- Stage isn't commercial (no `can_see_commercial`).

## Approach (brief)
- DB tests first (policies, append-only, the default and the backfill).
- Then `project-stage.ts` (unit), the action `changeStageAction` (one transaction: update and history row), then the page, table and filter.
- ADR-0012.

## Test plan
- **Acceptance:** `project-stages.feature` (`@task:101`).
- **New steps:**
  - `the project {string} is at the stage {string}`;
  - `I change the stage to {string}`;
  - `the project shows {string} since today`;
  - `I post a stage change of {string} to {string}` (leak);
  - `I see no {string} button`.
- **DB:** `project-stages.db.test.ts`.
- **Unit:** `project-stage.test.ts`, the filter and sort parsers.
- **Storybook:** `StageControl` (can change, read-only).

## Open questions
1. **Existing projects' stage:** *Default:* In work.
2. **New projects' default stage:** *Default:* Inquiry, chosen on the form.
3. **Can partner users change their own projects' stage?** *Default:* yes, like project settings; the commercial records stay hidden from them.
4. **A copy's stage:** *Default:* Inquiry.

## Progress log
- 2026-11-11 – Drafted with `project-stages.feature` (`@wip`).
- 2026-11-15 – Started in lane 1 (`feat/project-stages`). Readiness: added the worker scenario the criterion named (planner).
- 2026-11-15 – Acceptance steps written, `@wip` removed; red run: 9 of 9 fail on the missing feature (no "Stage" select, no `project.stage` column) (spec-writer).
- 2026-11-15 – Built (implementer): migration 0045 (`project.stage`, `project_stage_change`, policies, no update/delete grant, backfill to In work with a first history row by nobody), `rls-pins.mjs`; `project-stage.ts`, stage filter and sort; `changeStageAction` (one transaction, row locked; the same stage again records nothing); `StageControl` with its story; Stage on the new project form; Stage column and filter on All projects; catalogue text in both languages (labels and "<Stage> since"); copies start at Inquiry with a first history row; demo projects spread over the stages. "Since" is the latest history row's day, else the project's creation day (projects made by fixtures have no history). The stage label is its own element in the "since" line, so "I see the text \"Quote\"" finds it. Tests: `project-stages.db.test.ts` (14, the migration's backfill re-run in a rolled-back transaction), `user-delete.db.test.ts` (a stage change by the deleted user), unit (`project-stage`, filters, sort, `stage-actions`, `stage-control`, seed plan), the seed's DB test; 9 of 9 `@task:101` scenarios pass.
- 2026-11-15 – Full suites in lane 1: unit all green (dashboard 482), lint and typecheck clean; full e2e (2 workers, the machine under heavy load from other processes) 324 passed, 19 timed out at ~30 s (reading forms, readings, visits, soft delete, assignees, members, workspaces), and all 19 passed on a one-worker rerun with warm servers. The 4-worker runs timed out widely for the same reason (load average up to 200). `@task:053` "A project for a sub-company shows on both pages…" passed (implementer).
- 2026-11-15 – Note on the red runs: the unit and DB tests were run red locally before each `feat:` commit (shown in the session), not as separate `test:` commits; history is left as it is (implementer).
- 2026-11-15 – Review fixes (implementer): migration 0045 edited (not on `main` yet; `app_lane1` dropped, recreated and migrated): the insert policy wants `to_stage` to be the project's stage, `app_user` may insert every column but `changed_at`, and the backfill rows are dated at the project's creation. The app writes history through `recordStageChange` (`@repo/db`), since a Drizzle insert names `changed_at` too and the column grant refuses it. `copyProject` did record the first stage (the security reviewer was right); `stage-history.db.test.ts` now covers it as the runtime role. StageControl starts over from the current stage after a made-up value; the tampered-select step looks up a customer by name instead of branching on the label; the since step accepts yesterday (UTC). SEC-53 added, SEC-21 noted.

- 2026-11-15 – Reviews (access, security, code): no leaks, no blockers; fixes above. Local QA stopped: the machine ran at load average 220–240 from other processes (257 zombies), so CI `verify` and `e2e` are the full-suite gate for this PR.
## Parking lot
- May a canceled project's stage change? Today it can (owner).
- E2E forged stage posts from an auditor, a crew worker, and against a deleted project: they have no form to post from. Covered by `project-stages.db.test.ts` (insert policy) and `stage-actions.test.ts` (`requireProjectAccess`).
- Rename "Status" (derived from tasks) to "Progress" (changes existing scenarios; owner).
- Stage counts and "stuck in a stage for N days" on the overview.
- Required fields per stage (e.g. no Ordered without a work order).
- Scheduled: planning future visits conflicts with `site-visits.feature` "A visit needs a date, not in the future" (task 058). Scheduling (M20) changes that rule in its own `docs(features):` commit or adds planned visits as a separate record.
