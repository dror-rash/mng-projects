# Task 122: Project page tabs by phase

- **Status:** todo
- **Milestone:** M22 Guided project flow
- **Zone / package:** `apps/dashboard` (`app/projects/[projectId]`, `features/projects`, `features/visits`, `features/readings`, `messages/`), `e2e`
- **Feature file:** `docs/features/project-tabs.feature` (`@task:122`); existing scenarios that use a section moved off the Overview tab gain one step at the start (see Scope)
- **Depends on:** task 121 (the stage bar and card sit above the tabs; both tasks edit the project page)

## Why
The project page is one long column of sections (site, visits, readings, files, reports, crew, tasks) unrelated to where the job is. Grouping them in tabs that follow the phases, and opening on the tab of the current stage, puts what the stage needs in front.

## Scope
- **Tabs** under the stage bar and the "Next step" card, for everyone who sees the project: Overview סקירה · Sales מכירה · Work ביצוע · Reports דוחות · Billing חיוב (Hebrew *default*, "דוחות" and "חיוב" as the stage labels of task 101).
  - A list of links labelled "Project sections" (*default*: links with `aria-current="page"` on the open one, not the ARIA tab widget, since each tab is its own address and the page is server-rendered).
  - Each tab is `?tab=overview|sales|work|reports|billing`; a `const` list `PROJECT_TABS` in `features/projects/project-tabs.ts` with `parseProjectTab` and `tabForStage`.
  - Without `?tab=`, or with an unknown value, the page opens on the current stage's tab: Inquiry → Overview; Quote, Ordered → Sales; Scheduled, In work → Work; Reporting → Reports; Billing → Billing; Closed → Reports.
  - Only the open tab's sections are rendered (and queried).
  - On a phone (360 px) the tabs fit without the page scrolling sideways; in Hebrew they run right to left.
- **What goes where:**
  - **Overview:** the "Site" section, "Add task" and the task board (*default*: tasks are general to the job, not one phase); later the timeline (task 108).
  - **Sales:** later work orders (tasks 106–107) and quotes (M16). Until then: "Quotes and work orders will show here." ("הצעות מחיר והזמנות עבודה יופיעו כאן.", *default*).
  - **Work:** "Visits", "Readings", "Photos and files" (*default*: photos and files come from field work and visits), "Crew".
  - **Reports:** "Reports".
  - **Billing:** later bills (M19). Until then: "Bills will show here." ("חשבונות יופיעו כאן.", *default*).
  - Above the tabs on every tab: the header (name, customer, actions), the stage bar and the "Next step" card. The communications panel (task 103) sits beside the tabs, not in one.
- **Returning to the right tab:**
  - deleting a visit (`features/visits/actions.ts`) and the visit, reading and new-visit pages' links back to the project go to `?tab=work`;
  - after a stage move (bar or "Move to") the page opens on the new stage's tab (*default*: no `?tab=` in the redirect);
  - actions that stay on the page (`useActionState`: tasks, uploads, crew) keep the URL, so the open tab stays.
- **Existing scenarios** (the task's first commit, a `docs(features):` commit saying why: sections moved into tabs): a scenario that opens a project page and then uses a section that is no longer on that project's opening tab gets `And I open the "<Tab>" tab` after the page step. Projects written by fixtures are at Inquiry, so they open on Overview: expect scenarios in `site-visits.feature`, `readings.feature`, `attachments.feature`, `reports.feature`, `workers.feature`, `partner-access.feature`, `soft-delete.feature`, `roles.feature` and `poc-flow.feature`. No step changes its wording; the spec-writer lists the edited scenarios in the progress log.

## Out of scope
- The communications panel (task 103 places it; see its scope).
- Moving the header actions (edit, copy, cancel, delete) into a menu.
- Remembering the last tab per person.

## Acceptance criteria
- [ ] The page opens on the tab of the current stage, for each of the eight stages. ("The project page opens on the current stage's tab")
- [ ] Each tab shows its sections and only those. ("Each tab shows its own sections")
- [ ] A tab has its own address that survives a reload; an unknown tab opens the stage's tab. ("A tab has its own address")
- [ ] Sales and Billing say what will show there. ("Sales and Billing say what will come")
- [ ] On a phone in Hebrew the tabs fit and work. ("The tabs on a phone, in Hebrew")
- [ ] A worker on the crew of a project in work lands on Work and records a visit there. ("A worker lands on the Work tab")
- [ ] Every existing scenario still passes (with the added tab step where needed).

## Security notes
- No new data. Rendering only the open tab must not change who sees what: each section keeps its own query and role checks.
- `?tab=` is parsed against the list; any other value opens the stage's tab, never an error page or raw text.
- Not a security-sensitive path.

## Approach (brief)
- `project-tabs.ts` (unit: parse, stage → tab) first.
- Then split `page.tsx` into the shared top and one server component per tab; only the open one runs its queries.
- `ProjectTabs` (links) in `features/projects/` with a story; RTL and phone in the story.

## Test plan
- **Acceptance:** `project-tabs.feature` (`@task:122`); the full suite for the edited scenarios.
- **New steps:**
  - `I open the {string} tab` (follows the tab link);
  - `the {string} tab is open`;
  - `the page shows the sections {string}` (the region names in the open tab, in order; a name matches from its start, since the task board's columns carry their counts, "To do 1");
  - `I open the {string} project page with {string} in its address` (e.g. `?tab=reports`).
- **Reused:** `the project {string} is at the stage {string}`, `I am on the {string} project page`, `I reload the page`, `I see the text {string}`, `my screen is {int} pixels wide`, `my language cookie is set to {string}`, `the page does not scroll sideways`, `the page is right to left`, `I am signed in as a worker`, `I am on the crew of {string}`.
- **Unit:** `project-tabs.test.ts`.
- **Storybook:** `ProjectTabs` (each open tab, Hebrew, phone).

## Open questions
None blocking. Defaults taken:
1. **Tasks:** on Overview.
2. **Photos and files:** on Work.
3. **Tabs with nothing yet (Sales, Billing):** shown, with a line saying what will come.
4. **Workers and partner users:** see all five tabs; commercial sections inside them stay hidden by ADR-0012.
5. **After a stage move:** the page opens on the new stage's tab.

## Progress log
- 2026-11-15 – Drafted with `project-tabs.feature` (`@wip`) (planner).

## Parking lot
- Counts on tabs (e.g. "Work 3" for open visits).
- Remembering the last tab per person or per project.
- Hiding Sales and Billing from workers if they find them confusing (owner).
- Sales, Reports and Billing will list quotes (M16), customer reports (M17) and bills (M19) on one shared "document with delivery tracking" pattern: Draft → Sent (to, on) → Accepted / Received / Paid, with a reminder date. Designed once with M16 (owner-approved design, 2026-11-15); not built in M22.
