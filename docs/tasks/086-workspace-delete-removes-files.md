# Task 086: Deleting a workspace deletes its files from storage

- **Status:** in-progress
- **Milestone:** cross-cutting (security), M13 follow-up
- **Zone / package:** `packages/storage` (a `removePrefix` helper), `apps/dashboard/features/workspaces/settings-actions.ts` (`deleteWorkspaceAction`), `e2e/steps` (two new steps). No migration. Commit types `test` → `fix(dashboard)` / `feat(storage)`.
- **Feature file:** `docs/features/workspaces.feature` (two `@wip @task:086` scenarios)
- **Depends on:** task 057 (storage), 059 (attachments), 029 (workspace delete): done.

## Why
Deleting a workspace removes its rows (attachments cascade), but its photos, files and reports stay in the bucket forever. A deleted workspace's documents should be gone, for retention and erasure requests, not just unreachable. Register **SEC-08**.

## Scope
- `@repo/storage`: `removePrefix(prefix)` deletes every object under a prefix (paged; a missing object isn't an error). It refuses an empty prefix or one that doesn't end in `/`.
- `deleteWorkspaceAction`: after the delete commits (outside `withAccess`, before the redirect), `removePrefix("<workspaceId>/")`; object keys start with the workspace id (`objectKey`). A storage failure doesn't undo the delete or show an error to the admin: it is logged with the workspace id only (no names, no file names) and left for a later sweep (parking lot).
- The action's doc comment lists files among what is deleted.
- Nothing else deletes files: a soft-deleted project or attachment keeps its object (restorable, task 059).

## Out of scope
- A periodic sweep for prefixes or objects whose workspace or row is gone (parking lot; task 087's question 3).
- Purging soft-deleted attachments after a retention period (design Parking lot).
- Account deletion (SEC-18 is task 088; no UI deletes accounts).

## Acceptance criteria
- [x] After an admin deletes a workspace, download links to its photos and files copied before the delete no longer open. → "Deleting a workspace deletes its photos and files"
- [x] Another workspace's files are untouched. → "Deleting a workspace keeps another workspace's files"
- [x] `removePrefix` refuses an empty or unterminated prefix, and removes only objects under the prefix → `packages/storage` unit test and a `test:storage` case against the local server.
- [x] A storage failure after the delete still lands the admin in their next workspace (unit test of the action's error path with the storage call failing; the only mock is the storage boundary). → `features/workspaces/workspace-files.test.ts`: the action awaits `removeWorkspaceFiles` between the commit and the redirect, and that helper never throws for a storage failure, so the test is on the helper with `@repo/storage` mocked; a test of the whole action would also need the session, `next/*` and the database mocked.

## Security notes
Touches workspace deletion (admins only, after typing the name; unchanged) and `packages/storage`, so the `security-reviewer` runs; `access-auditor` checks that the prefix comes from the workspace the admin just deleted under the lock, never from the form. The worst bug here is deleting another workspace's files: the prefix is built from the locked workspace row's id, ends in `/`, and the second scenario checks the neighbor. Fixes register gap **SEC-08** (the sweep safety net is parked).

## Approach (brief)
Red: the two scenarios (the first fails today: the copied link still opens) and the `removePrefix` tests. Then `removePrefix` and the call in the action. No ADR.

## Test plan
- Acceptance: the two `@task:086` scenarios in `workspaces.feature`.
- Unit: `removePrefix` argument checks; the action's storage-failure path.
- Storage (`test:storage`): prefix delete against `fake-gcs-server`.
- Storybook: none.
- **New steps:** `I copy the download links of the photo {string} and the file {string}` (follows the app's download address to the signed storage URL and keeps it), `the copied download links no longer open`, `the copied download links still open`. Reused: `I am signed in with an existing account`, `I create a workspace named {string}`, `I have a customer {string} with status {string} and tags {string}`, `{string} has a site {string}`, `I have a project named {string} at the site {string}`, `I am on the {string} project page`, `I add the photo {string} with {string}`, `I add the file {string} with {string}`, `I delete the workspace {string}`.

## Open questions
1. **Inline or queued?** Default: inline after the commit, awaited before the redirect (a POC workspace has few files). A queue or job only if a delete is measured to be slow. **Taken: the default.**

## Decisions
- **When storage fails after the commit:** the rows are gone and can't come back, so the delete stands and the admin still lands in their next workspace. `removeWorkspaceFiles` catches the failure and logs `Could not delete a deleted workspace's files from storage` with `{ workspaceId, code }` only: never the error's message (a storage error can name an object key) and never names or file names. The folder stays until the parked sweep.
- **Which folder:** `workspacePrefix(id)` of the id the `DELETE … RETURNING` gave inside the transaction that locked the row, never a form value; `workspacePrefix` refuses an id that isn't one key name, and `removePrefix` refuses an empty prefix, `/`, an empty folder or one without the trailing `/` (`ws-1` would match `ws-10/…`).
- **Paging:** `removePrefix` deletes the first page of the listing until the listing is empty, without page tokens: deleting moves the pages, and `fake-gcs-server` 1.52 leaves `nextPageToken` out when it truncates (a first version that followed tokens left objects behind in `test:storage`). It stops with an error if a page repeats (no progress).
- **What's under the folder:** every attachment kind (photos, files, reports, task 064) is keyed by `objectKey` (`<workspace>/<project>/<uuid>`), including unconfirmed uploads and soft-deleted attachments; nothing else is stored. Readings, visits and the rest are rows only and go with the cascade.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-08); owner: "start fixing the P1 gaps".
- 2026-11-10 – Started in lane 2 (owner: "do the rest of the P1"; build now, merge after the POC demo on 2026-11-13). Q1 default (inline).
- 2026-11-10 – Red: `@wip` off both scenarios (tagged `@slow`: sign-up, setup and two uploads pass 30 s on a loaded dev machine); steps `I copy the download links of …`, `the copied download links no longer open` / `still open` in `attachments.steps.ts`. "deletes its photos and files" fails (copied signed link answers 200, expected 404); "keeps another workspace's files" passes (a guard, green before and after).
- 2026-11-10 – Green in lane 2. Red `becac68` (unit tests for `removePrefix`'s checks and `workspacePrefix`, a `test:storage` case, the dashboard helper's tests; throwing stubs so the commit typechecks), green `1cde7fe` (`removePrefix`, `workspacePrefix`, `removeWorkspaceFiles`, the call in `deleteWorkspaceAction`), refactor `e86be65` (`objectKey` builds on `workspacePrefix`). Commit types follow the orchestrator (`test(dashboard)` → `feat(dashboard)` → `refactor(storage)`), not the `fix(dashboard)` / `feat(storage)` this file named. Checks: `@task:086` e2e 2/2; `pnpm test` (dashboard 442, storage 10, all packages green); `test:storage` 8/8; lint, typecheck, build green; full `CI=1 pnpm test:e2e --workers=2` 325 passed.

## Parking lot
- A periodic sweep for prefixes whose workspace is gone (also catches a failed inline delete or a SQL cascade).
