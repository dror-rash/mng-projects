# Task 085: Storage refuses uploads over the size limit

- **Status:** todo (after the POC)
- **Milestone:** cross-cutting (security), M13 follow-up
- **Zone / package:** `packages/storage` (`createUploadUrl`), `apps/dashboard/features/attachments/actions.ts` (passes the kind's limit), `infra/storage.tf` (CORS allowed headers, both buckets), `docker-compose.yml` (`fake-gcs-server -cors-headers`). No migration. Commit types `test(storage)` → `fix(storage)` / `fix(infra)`.
- **Feature file:** none new (see "Test plan": the visible limits are already `attachments.feature` and `reports.feature` scenarios; what changes is where the bytes are stopped)
- **Depends on:** task 057 (storage), 059 (attachments), 064 (reports): done.

## Why
Today the app checks the declared size before it signs an upload URL and checks the stored object afterwards, but the signed URL itself has no size limit: a client can send far more than it declared, and if it never asks the app to confirm the upload, the oversized object stays in the bucket (storage cost). Signing the allowed size range into the URL makes storage refuse an oversized upload before it is stored. Register **SEC-07** (size cap part; abandoned uploads are task 087).

## Scope
- `createUploadUrl({ key, contentType, maxBytes })`: signs `x-goog-content-length-range: 0,<maxBytes>` as an extension header next to `x-goog-if-generation-match: 0`, and returns it in `headers` so the browser sends it. `maxBytes` is required (no unlimited upload URL).
- `startUploadAction` passes the kind's limit from `attachment-limits.ts` (photos 20 MB, files and reports 50 MB, as today). The confirm-time `stat` check in `finishUploadAction` stays (defense in depth, and the local fake server may not enforce the header).
- **CORS:** the browser's preflight must allow the new request header: add `x-goog-content-length-range` to `files_cors_response_headers` in `infra/storage.tf` (main and preview buckets) and to `fake-gcs-server`'s `-cors-headers` in `docker-compose.yml`.
- **Order of rollout** (in the PR description): the owner applies the Terraform CORS change **before** the code reaches `main`; the preview bucket's CORS too before the PR's preview runs the upload scenarios.
- The `createUploadUrl` doc comment says what the URL now limits.

## Out of scope
- Cleanup of unconfirmed or orphaned uploads, and a cap on uploads in progress (task 087).
- Changing the limits themselves (owner's open question 3 in task 059).
- Per-workspace storage quotas (parking lot).

## Acceptance criteria
- [ ] The signed upload URL's signed headers include `x-goog-content-length-range`, and the returned headers carry `0,<maxBytes>` for each kind's limit → unit test in `packages/storage` (red first) and an action-level unit test that photos get 20 MB and files and reports 50 MB.
- [ ] `createUploadUrl` without `maxBytes` doesn't typecheck.
- [ ] The existing upload scenarios (`attachments.feature`, `reports.feature`, `poc-flow.feature`) pass locally and on the PR's preview (CORS preflight accepts the header).
- [ ] On the preview (real Cloud Storage), a PUT to a photo's signed URL with a body larger than 20 MB is refused by storage (400) and no object is created: a hand check with the commands and status codes (no URL or token) in the PR.
- [ ] `terraform plan` shows only the two buckets' CORS changing (output in the PR).

## Security notes
Touches `packages/storage`, upload code and `infra/`, so the `security-reviewer` runs. Access checks are unchanged (the app still checks access and limits before signing). The risk is breaking uploads on `main` if the CORS change isn't applied first, so it waits until after the POC and the rollout order is in the PR. Fixes part of register gap **SEC-07** (with task 087).

## Approach (brief)
Red: a unit test asserting the signed URL's `X-Goog-SignedHeaders` and returned headers (no network: the local credentials sign offline). Then the storage change, the action change, Terraform and docker-compose CORS. No ADR.

## Test plan
- Acceptance: the existing upload scenarios (no new ones: an upload over the limit is already refused with "Photos can be up to 20 MB" / "Files can be up to 50 MB" / "Reports can be up to 50 MB"; an e2e scenario of a client that lies about the size would pass locally with or without this change, because `fake-gcs-server` doesn't enforce the header and the confirm check catches it).
- Unit: `packages/storage` signing test; `attachments` action limit mapping.
- Storage (`test:storage`): an upload with the header to the local server still works.
- By hand on the preview: the oversized PUT above.
- Storybook: none.

## Open questions
- None blocking. (If Cloud Storage turns out not to enforce the header on V4 signed PUTs, the implementer stops and reports; the fallback is task 087's cleanup plus a resumable-upload session with a fixed size, which would need its own task.)

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-07); owner: "start fixing the P1 gaps".

## Parking lot
- A per-workspace storage quota.
