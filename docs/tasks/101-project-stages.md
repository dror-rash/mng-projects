# Task 101: Project stages

- **Status:** todo
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
- [ ] An admin moves a project from Inquiry to Quote and sees "Quote since <today>". ("I move a project to the next stage")
- [ ] A stage can move back. ("A stage can go back")
- [ ] The projects table shows and filters by stage; a canceled project keeps its stage. ("The projects table shows and filters by stage", "A canceled project keeps its stage")
- [ ] New projects start at Inquiry unless another stage is chosen. ("A new project starts at Inquiry")
- [ ] Workers and auditors see the stage but can't change it; a partner changes their own project's stage; another partner's stage change is refused like a made-up id. ("Who can change a stage", "Another partner's project's stage can't be changed")
- [ ] A made-up stage value is refused. ("A made-up stage is refused")

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
  - `I post a stage change of {string} to {string}` (leak).
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

## Parking lot
- Rename "Status" (derived from tasks) to "Progress" (changes existing scenarios; owner).
- Stage counts and "stuck in a stage for N days" on the overview.
- Required fields per stage (e.g. no Ordered without a work order).
- Scheduled: planning future visits conflicts with `site-visits.feature` "A visit needs a date, not in the future" (task 058). Scheduling (M20) changes that rule in its own `docs(features):` commit or adds planned visits as a separate record.
