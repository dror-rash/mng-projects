# Task 099: Translate customers, sites, partners, members, settings and Deleted

- **Status:** todo
- **Milestone:** M14 Hebrew and English
- **Zone / package:** `apps/dashboard` (`features/organizations`, `features/sites`, `features/partners`, `features/workspaces`, `features/crews`, `features/deleted`), `e2e`
- **Feature file:** `docs/features/language.feature` (`@task:099`)
- **Depends on:** tasks 094 and 096

## Why
Customers and sites are the start of every job in the owner's flow.

## Scope
- **Customers:** the table, filters, the customer page with contacts, the primary contact, notes, sub-companies, tags and status labels (Lead ליד, Active פעיל, Past לשעבר), and the new and edit pages.
- **Sites:** the site page, on-site contacts, "Open in maps".
- **Workspace pages:** partners, members and invite links (role labels Admin, Auditor, Worker, Partner), workspace settings, the workspace switcher, crews, the Deleted page.
- **Errors:** the form errors of all of the above.

## Out of scope
Field data (task 100).

## Acceptance criteria
- [ ] In Hebrew the customers page heading is "לקוחות" and the Status filter offers "ליד, פעיל, לשעבר". ("Customers in Hebrew")
- [ ] In Hebrew an invalid customer email shows "יש להזין כתובת אימייל תקינה". ("A customer form error in Hebrew")
- [ ] Every existing scenario passes unchanged in English.

## Security notes
Text only; invite links and role changes keep their server checks unchanged. Role labels are display only: the stored roles and their parsing don't change. No security-sensitive paths.

## Approach (brief)
As task 098, one feature folder at a time.

## Test plan
- **Acceptance:** `language.feature` `@task:099`.
- **Unit:** organization status and kind helpers, role labels; parity.

## Open questions
1. **Hebrew role names:** Admin מנהל, Auditor מבקר, Worker עובד שטח, Partner שותף. *Default:* these, reviewed by the owner.

## Progress log
- 2026-11-11 – Drafted with `language.feature` (`@wip`).

## Parking lot
