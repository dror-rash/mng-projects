# Task 086: Deleting a workspace deletes its files from storage

- **Status:** todo (after the POC)
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
- [ ] After an admin deletes a workspace, download links to its photos and files copied before the delete no longer open. → "Deleting a workspace deletes its photos and files"
- [ ] Another workspace's files are untouched. → "Deleting a workspace keeps another workspace's files"
- [ ] `removePrefix` refuses an empty or unterminated prefix, and removes only objects under the prefix → `packages/storage` unit test and a `test:storage` case against the local server.
- [ ] A storage failure after the delete still lands the admin in their next workspace (unit test of the action's error path with the storage call failing; the only mock is the storage boundary).

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
1. **Inline or queued?** Default: inline after the commit, awaited before the redirect (a POC workspace has few files). A queue or job only if a delete is measured to be slow.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-08); owner: "start fixing the P1 gaps".

## Parking lot
- A periodic sweep for prefixes whose workspace is gone (also catches a failed inline delete or a SQL cascade).
