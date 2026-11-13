# Task 088: An account that uploaded files or recorded visits can be deleted

- **Status:** done (PR #90, replacing PR #81)
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
- [x] Deleting a user with an upload and a visit, while the workspace exists, succeeds (red first: fails today with the two triggers' errors). → DB test.
- [x] The broader "every authored row" DB test passes: rows stay, authors become null. → DB test.
- [x] Changing `uploaded_by` or `created_by` to **another user** is still refused (existing DB tests stay green, plus one case each if missing).
- [ ] `rls-pins.mjs` matches and the role check passes: locally done (`pnpm test:infra`); the PR's preview still to check.

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
- 2026-11-10 – Started in lane 6 (owner: "do the rest of the P1"; build now, merge after the POC demo on 2026-11-13).
- 2026-11-10 – Red: `user-delete.db.test.ts` (deleting an uploader, a visit author, and a user with every kind of row, while the workspace exists) failed with `an attachment stays what and where it was put` / `a visit keeps its project and author` from the foreign keys' `SET NULL`. Green: migration 0040 lets `uploaded_by` / `created_by` become null only once the user row is gone (`NOT EXISTS` in `"user"`), tighter than "to null" because `app_user` may update `site_visit.created_by` (an author or admin could otherwise disown a visit); reassigning to another user, or clearing while the account exists, is refused (new cases). Pins updated (4 hashes); `pnpm test:infra` passes. ARCHITECTURE: user deletion convention. Checks in the lane: lint, typecheck, `pnpm test` 568, `@repo/db` `test:db` 154, `@repo/dashboard` `test:db` 19, build, `CI=1 pnpm test:e2e --workers=2` 323 passed, none flaky. The green commit also fixed the test's own expectation (the deleted account's `user` row had to leave the expected snapshot); that only showed once the delete went through.
- 2026-11-10 – Review fixes (access audit: nothing ≥ Medium; code review: no blockers). The broad test now covers every user column, soft deletes included (photo, reading, customer, note, site, site contact, a project that stays deleted; the restored project went, as `restore_project` clears `deleted_by`), and checks the exact `table.column` list pointing at the user. New cases: after the delete an orphaned photo or visit can't be given to another user (maintenance and `app_user`); deleting a crew worker with an assigned task clears both. Migration 0040 regenerated with a later journal `when` (task 089's 0040/0041 in lane 3 would otherwise make it skipped on a shared database), same SQL.
- 2026-11-12 – Merged `main` (tasks 089 and 090: migrations 0040–0042). The migration is regenerated as 0043 (`drizzle-kit generate --custom`, fresh journal `when`), same SQL; earlier mentions of 0040 in this log mean this migration.
- 2026-11-12 – Merged as PR #90, which replaced PR #81 (closed); migration 0043. SEC-18 fixed.

## Parking lot
- What an erasure request removes beyond the account (content, files the user uploaded): owner decision.
- An admin action to remove a member's account (today an admin can only remove the membership).
- After task 089 merges, regenerate this migration as 0042 with a fresh `when`; update ARCHITECTURE's migration number.
- A future account-deletion path must refuse (or transfer) a sole admin: the user cascade removes memberships without `changeMembership`, so it can leave a workspace with no admin.
- Unconfirmed uploads of a deleted user are visible to nobody (`attachment_select` shows unconfirmed rows only to their uploader): task 087's cleanup must handle `uploaded_by is null`.
- `form_submission_keep` still lets `submitted_by` become null while the account exists (harmless today: `app_user` has no update on readings); tighten it like 0040 if readings ever get an update grant.
