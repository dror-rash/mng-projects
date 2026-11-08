# Task 088: An account that uploaded files or recorded visits can be deleted

- **Status:** todo (after the POC)
- **Milestone:** cross-cutting (security), M13 follow-up
- **Zone / package:** `packages/db` (one migration replacing two trigger functions; `rls-pins.mjs`; DB tests). Commit types `test(db)` → `fix(db)`.
- **Feature file:** none (no page deletes accounts today; DB tests are the check)
- **Depends on:** tasks 058, 059, 061: done.

## Why
Deleting a user account fails once that user has uploaded a file or recorded a site visit: the foreign keys set the author to null on delete, but two triggers refuse any change of the author, the foreign key's own update included. So an erasure request, or removing a compromised account, can't be done without hand edits to the database. Register **SEC-18**; the visit half was found in task 061 (its "Bug found" note, not task 058's parking lot).

## Scope
- A new migration (`CREATE OR REPLACE FUNCTION`; applied migrations untouched, rule 12):
  - `attachment_check()` lets `uploaded_by` change only **to null** (as the user foreign key's `ON DELETE SET NULL` does); every other change of `uploaded_by`, and every other rule of the function, stays as it is;
  - `site_visit_keep_project()` the same for `created_by`;
  - the same pattern `form_submission_keep` already uses for `submitted_by` (task 061).
- `rls-pins.mjs`: the two functions' pins updated (the runtime role check compares them on deploy).
- A DB test that deletes a user **while their workspace still exists**, after that user has: uploaded a confirmed photo, recorded a visit (and been listed on one), filled a reading, created and been assigned a task, created a project and a customer, written a customer note, and deleted and restored something; the delete succeeds, the rows stay with a null author, and nothing else changes.

## Out of scope
- A way for users or admins to delete an account (Better Auth's `deleteUser` stays off; `docs/SECURITY.md` "Checked and fine").
- What "erasure" means for content the user wrote (names in notes, file contents): an owner and legal question, parking lot.
- Other trigger messages (SEC-36).

## Acceptance criteria
- [ ] Deleting a user with an upload and a visit, while the workspace exists, succeeds (red first: fails today with the two triggers' errors). → DB test.
- [ ] The broader "every authored row" DB test passes: rows stay, authors become null. → DB test.
- [ ] Changing `uploaded_by` or `created_by` to **another user** is still refused (existing DB tests stay green, plus one case each if missing).
- [ ] `rls-pins.mjs` matches, the role check passes locally (`test:infra` or the CI e2e job's check) and on the PR's preview.

## Security notes
A migration that redefines two trigger functions (not definer functions, no grants or policies), so the `security-reviewer` runs for the migration and the `access-auditor` checks that only the null case opened up: an author can't be reassigned to someone else, so nobody can pass their upload or visit off as another user's. Fixes register gap **SEC-18**.

## Approach (brief)
Red: the DB test deleting a user with an upload and a visit (and the broader one). Then the migration (`pnpm db:generate --custom`), copying each function from its latest migration and changing only the author condition; update the pins. No ADR.

## Test plan
- Acceptance: none.
- DB: `packages/db/src/` (e.g. `user-delete.db.test.ts`), plus the reassignment-refused cases.
- Storybook: none.

## Open questions
- None blocking.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-18) and task 061's "Bug found" note; owner: "start fixing the P1 gaps".

## Parking lot
- What an erasure request removes beyond the account (content, files the user uploaded): owner decision.
- An admin action to remove a member's account (today an admin can only remove the membership).
