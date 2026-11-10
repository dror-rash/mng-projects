# Task 087: Abandoned uploads are cleared, and unfinished uploads are capped

- **Status:** in-progress
- **Milestone:** cross-cutting (security), M13 follow-up
- **Zone / package:** `packages/db` (one migration: a definer function, its RLS pin), `apps/dashboard/features/attachments/` (`actions.ts`, `attachment-limits.ts`), `e2e/steps` (one new step). Commit types `test` → `feat(db)` / `fix(dashboard)`.
- **Feature file:** `docs/features/attachments.feature` (one `@wip @task:087` scenario)
- **Depends on:** task 085 (the size cap; so each abandoned upload is at most its kind's limit). Task 059: done.

## Why
An upload starts with an unconfirmed record and a signed URL; it is confirmed only when the browser comes back after sending the file. If it never comes back (a dropped phone connection, a closed tab, or on purpose), the record and the stored object stay forever, and nothing limits how many a user can leave behind. Register **SEC-07** (cleanup part; the size cap is task 085).

## Scope
- **Stale uploads:** an upload unconfirmed for more than **1 hour** (question 1) is stale. The signed URL lasts 15 minutes, so a stale upload can't still be arriving.
- **Clearing them, in the app, no new infrastructure:** when anyone starts an upload in a workspace, the stale uploads of that workspace are deleted and their objects removed:
  - a `SECURITY DEFINER` function (e.g. `clear_stale_uploads(p_workspace uuid) returns setof text`, the storage keys it deleted), `search_path` pinned, callable only by a user who can work on a project in that workspace, deleting only unconfirmed rows older than the cutoff in that workspace; its definition pinned in `rls-pins.mjs`;
  - `startUploadAction` calls it inside `withAccess` before recording the new upload, then removes the returned objects after the transaction (a failed remove is logged with the count only, never names).
- **Cap on unfinished uploads:** a user may have at most **10** (question 2) unconfirmed, not-yet-stale uploads per workspace; `startUploadAction` refuses the 11th with the message **"Too many uploads in progress. Try again later."** (question 3), shown like the other upload errors. The check and the insert are race-safe enough that two parallel starts can't both pass at 10 (implementer's choice: a row lock on the workspace or a count in the insert; named in the PR).
- The `startUploadAction`/`finishUploadAction` comment block describes the lifecycle (start → upload → confirm, or cleared after an hour).

## Out of scope
- A scheduled, bucket-wide sweep for objects without a record or prefixes of deleted workspaces (question 4; task 086 parking lot).
- Purging soft-deleted (confirmed) attachments.
- Per-workspace storage quotas.

## Acceptance criteria
- [ ] With 10 unfinished uploads of mine in the workspace, the next one is refused with "Too many uploads in progress. Try again later.", and nothing is recorded. → "Too many unfinished uploads are refused"
- [ ] Starting an upload clears the workspace's uploads that were left unconfirmed for over an hour (records and objects), whoever left them, and keeps confirmed, deleted and recent unconfirmed ones. → DB test (backdated rows) and a `test:storage`-backed action test.
- [ ] The function refuses (clears nothing) for a user who can't work on a project in that workspace: an auditor, a partner's user of another workspace, a made-up workspace id. → DB tests.
- [ ] `hardening.db.test.ts` and `rls-pins.mjs` cover the new function (pinned `search_path`, checks `app.user_id`).

## Security notes
Touches upload actions, a migration with a definer function, and storage deletes, so both the `access-auditor` and the `security-reviewer` run. The function deletes rows other users created; it must stay limited to unconfirmed rows past the cutoff in the caller's own workspace, and it returns only storage keys (internal, never shown). Unconfirmed uploads are invisible to everyone but their uploader (task 059's select policy), so clearing another user's stale one changes nothing anyone sees. Partner and worker leak checks: a partner's user or worker can trigger the clearing only for their own workspace, and only stale unconfirmed rows go. Fixes part of register gap **SEC-07** (with task 085).

## Approach (brief)
Red: DB tests for the function (none exists), the `@task:087` scenario (the 11th start is accepted today). Then the migration (`pnpm db:generate` for an empty custom migration, function + grant + pin), the action changes, the step. No ADR.

## Test plan
- Acceptance: `attachments.feature` "Too many unfinished uploads are refused".
- DB: `clear_stale_uploads` (who may call it, what it deletes, the cutoff), in `packages/db/src/attachments.db.test.ts` or a new file.
- Unit: the cap's message comes from `attachment-limits.ts` (one place for the limit and the text).
- Storybook: none (the message shows through the existing uploader error state).
- **New step:** `my connection drops during {int} photo uploads` (adds that many photos through "Add photos" with every request after the start cut off (the PUT to storage and the confirm call), so each upload is recorded and never confirmed). Reused: the Background, `I am on the {string} project page`, `I add the photo {string} with {string}`, `I see the error {string}`, `the {string} section shows {string}`.

## Open questions
1. **How long before an unfinished upload is cleared?** Default: 1 hour (the URL lasts 15 minutes).
2. **How many unfinished uploads per person and workspace?** Default: 10 (the uploader sends files one at a time, so a normal user has at most one in progress plus any dropped ones).
3. **The message.** Default: "Too many uploads in progress. Try again later."
4. **A scheduled bucket-wide sweep** (objects with no record, prefixes of deleted workspaces) needs a scheduler and an identity that can read every workspace's records (a Cloud Scheduler job, Terraform, a new service account). Default: not now; revisit if the bucket's size drifts from the sum of the records' sizes.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-07); owner: "start fixing the P1 gaps".
- 2026-11-10 – Started in lane 4, based on task 085's branch (PR #84, not merged). Open questions take their defaults (1 hour; 10 unfinished per person and workspace; "Too many uploads in progress. Try again later."; no bucket-wide sweep now). From reviews of 086 and 088: the cleanup must handle `uploaded_by is null` (a deleted uploader). Merge after the POC demo on 2026-11-13, after 085.
- 2026-11-10 – Red: `@wip` removed from "Too many unfinished uploads are refused"; new step `my connection drops during {int} photo uploads` (aborts the PUT to storage and the confirm call, then reloads). Red run fails at `Then I see the error "Too many uploads in progress. Try again later."` (the 11th upload is accepted today). The shared `I add the photo` step now accepts the photo showing or an upload error, so a refused upload reaches the scenario's error check.

## Parking lot
- The scheduled sweep (question 4).
