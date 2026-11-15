# Task 104: Follow-ups due

- **Status:** todo
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `apps/dashboard` (home page, `features/communications`), `e2e`
- **Feature file:** `docs/features/customer-communications.feature` (`@task:104`)
- **Depends on:** task 103; task 124 ("Needs action" on the overview) if it has landed (placement only, see Scope)

## Why
Tracking a quote's answer or a report's receipt (flow steps 3, 8, 9) is mostly "call them back on Tuesday". The office needs one place that lists what is due.

## Scope
- **Overview:** a "Follow-ups" section for admins and auditors. It lists open follow-ups (a `follow_up_on` date and not done) that are overdue or due within the next 7 days, oldest first. Each shows:
  - the date ("Overdue" when before today, `todayUtc()`);
  - the customer, the project if any, and the summary.
  - Empty: "No follow-ups due."
- **"Mark done"** (admins), on the overview and on the entry in the Communications section: sets `follow_up_done_at`. "Done" shows on the entry; "Reopen" clears it.
- **Placement (M22, owner-approved design 2026-11-15):**
  - on the overview, "Follow-ups" is the third group of the "Needs action" section (task 124), after "Our move" and "Waiting for customer", still a region named "Follow-ups" and still only for admins and auditors. If task 124 hasn't landed, the section stands on its own and task 124 moves it in;
  - on the project page, the project's open follow-ups (overdue and due within 7 days, then later ones) sit at the top of the Communications panel (task 103), with "Mark done".
- No migration (task 103 has the columns).

## Out of scope
- Reminders by email or notification.
- Follow-ups on tasks (tasks already have due dates).

## Acceptance criteria
- [ ] An overdue and a this-week follow-up show on the overview, a later one doesn't, and a done one disappears. ("Follow-ups due show on the overview")
- [ ] Marking done from the customer page clears it from the overview; reopening brings it back. ("Marking a follow-up done and reopening it")
- [ ] The auditor sees follow-ups without the button; workers and partner users see no Follow-ups section. ("Who sees follow-ups")

## Security notes
Reads through `can_see_commercial`, writes through `can_change_commercial` (RLS and `features/access/`). The overview is shared by every role, so the section must not render, or query, for workers and partners. No security-sensitive paths.

## Approach (brief)
A query with the date window in SQL (strings compared as dates, CLAUDE.md), one action for done and reopen.

## Test plan
- **Acceptance:** the `@task:104` scenarios.
- **New step:** `the customer {string} has a communication saying {string} with a follow-up {int} days from today` (and `… days ago`).
- **Unit:** the window (overdue, 7 days).

## Open questions
1. **Window:** *Default:* overdue plus the next 7 days, matching "due this week" (task 019).

## Progress log
- 2026-11-11 – Drafted (`@wip`).
- 2026-11-15 – Placement amended for M22 (planner): the overview's Follow-ups become a group of "Needs action" (task 124); the project's open follow-ups head the Communications panel (task 103).

## Parking lot
- A follow-ups page with all open follow-ups.
- A count in the menu.
