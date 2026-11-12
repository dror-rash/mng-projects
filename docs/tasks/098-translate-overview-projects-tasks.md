# Task 098: Translate the overview, projects and tasks

- **Status:** todo
- **Milestone:** M14 Hebrew and English
- **Zone / package:** `apps/dashboard` (`features/projects`, `features/tasks`, `features/layout`, `features/navigation`, `features/workspaces` header parts, home page), `e2e`
- **Feature file:** `docs/features/language.feature` (`@task:098`)
- **Depends on:** tasks 094 and 096

## Why
The overview, the projects table and the task board are where people spend their day.

## Scope
- **Overview:** stats, charts and their tooltips, "Recently started", "Activity this week", overdue and due-this-week.
- **All projects:** the table, filters, sort labels, tiles, the new and edit project pages, cancel, copy and delete.
- **Project page:** everything except the field-data sections (task 100); the task board and the task page; My tasks.
- **Value sets:**
  - task status, priority, project status and lifecycle labels move to the catalogue;
  - their helpers return keys (ADR-0011), and the unit tests change to keys.
- **Errors:** project and task form errors ("Project name is required", "Task title is required" and the rest).

## Out of scope
- Customers, sites, partners, members, settings, Deleted (task 099).
- Visits, photos, readings, reports, reading forms (task 100).

## Acceptance criteria
- [ ] In Hebrew the overview heading is "סקירה" and the task board columns are "לביצוע", "בתהליך", "הושלם". ("The overview and a project's board in Hebrew")
- [ ] In Hebrew an empty project name shows "יש להזין שם לפרויקט". ("A project form error in Hebrew")
- [ ] Every existing scenario passes unchanged in English.

## Security notes
Text only; no data, roles or queries change. Value-set parsing must stay the same: only the labels move. No security-sensitive paths.

## Approach (brief)
One feature folder at a time, keeping each commit green. The value-set helpers change first, with unit tests on keys.

## Test plan
- **Acceptance:** `language.feature` `@task:098`.
- **Unit:** value-set helpers; parity.
- **Storybook:** existing stories render with the Hebrew catalogue.

## Open questions
1. **Hebrew wording** for statuses and priorities. *Default:* "לביצוע / בתהליך / הושלם", "נמוכה / בינונית / גבוהה", reviewed by the owner.

## Progress log
- 2026-11-11 – Drafted with `language.feature` (`@wip`).

## Parking lot
