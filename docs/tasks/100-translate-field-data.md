# Task 100: Translate visits, photos and files, reading forms, readings and reports

- **Status:** todo
- **Milestone:** M14 Hebrew and English
- **Zone / package:** `apps/dashboard` (`features/visits`, `features/attachments`, `features/reading-forms`, `features/readings`), `e2e`
- **Feature file:** `docs/features/language.feature` (`@task:100`)
- **Depends on:** tasks 094 and 096

## Why
Technicians record visits, photos and readings in the field; most of them will use Hebrew.

## Scope
- **Visits:** the visit pages and sections, who was there, and the errors ("A visit can't be in the future", "Choose who was there").
- **Photos, files and reports:** uploads, limits and their messages ("Reports must be PDF, Word, Excel, CSV, text or images", "Reports can be up to 50 MB").
- **Reading forms:** the builder, field types (Number, Text, Yes/no, Choice, Date), the Draft / Published / Archived labels.
- **Readings:** filling a reading, its values (Yes/no in the user's language), the reading page.
- **What isn't translated:** form and field labels that admins type stay as typed (ADR-0011), with `dir="auto"`.

## Out of scope
- Offline capture (062–063).
- The generated PDF report (065).

## Acceptance criteria
- [ ] In Hebrew the project page shows the "ביקורים" section and "תיעוד ביקור", and a future visit date shows "ביקור לא יכול להיות בעתיד". ("Visits in Hebrew")
- [ ] In Hebrew an admin-typed form name and field labels show as typed. ("What people type stays as typed")
- [ ] Every existing scenario passes unchanged in English.

## Security notes
Text only. Upload limits and type checks keep their server checks; only the messages move. Touches upload code (`startUploadAction` messages), so the `security-reviewer` runs (upload paths in `docs/SECURITY.md`).

## Approach (brief)
As task 098. The attachment-limit messages become keys, with their unit tests.

## Test plan
- **Acceptance:** `language.feature` `@task:100`.
- **Unit:** attachment limits, form status and field-type helpers, reading values (yes/no); parity.

## Open questions
1. **Hebrew wording:** "ביקורים", "תיעוד ביקור", "קריאות" for readings, "דוחות". *Default:* these, reviewed by the owner.

## Progress log
- 2026-11-11 – Drafted with `language.feature` (`@wip`).

## Parking lot
