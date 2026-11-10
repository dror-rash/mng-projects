# Task 085: Storage refuses uploads over the size limit

- **Status:** in-progress (code done; waiting for the owner's Terraform change and the preview hand check)
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
- [x] The signed upload URL's signed headers include `x-goog-content-length-range`, and the returned headers carry `0,<maxBytes>` for each kind's limit → unit test in `packages/storage` (red first) and an action-level unit test that photos get 20 MB and files and reports 50 MB.
- [x] `createUploadUrl` without `maxBytes` doesn't typecheck.
- [ ] The existing upload scenarios (`attachments.feature`, `reports.feature`, `poc-flow.feature`) pass locally and on the PR's preview (CORS preflight accepts the header). Locally: done (lane 8, against a `fake-gcs-server` started with the new `-cors-headers`); the preview waits for the owner's Terraform change.
- [ ] On the preview (real Cloud Storage), a PUT to a photo's signed URL with a body larger than 20 MB is refused by storage (400) and no object is created: a hand check with the commands and status codes (no URL or token) in the PR.
- [x] `terraform plan` shows only the two buckets' CORS changing (output in the PR), besides the six Cloud Run services' cosmetic `scaling` drift parked in task 068.

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
- 2026-11-10 – Started in lane 8 (owner: "do the rest of the P1"; merge after the POC demo on 2026-11-13; the owner applies the CORS Terraform before the code reaches `main`).
- 2026-11-10 – Implemented. `createUploadUrl` requires `maxBytes` (a positive whole number) and signs `x-goog-content-length-range: 0,<maxBytes>`; `startUploadAction` passes `maxUploadBytes(kind)`; `finishUploadAction`'s check stays. Red first: the action test (`maxBytes` undefined) and the storage test (a type error, so the commit guard wouldn't take it alone: it landed with the code). Seen locally: `fake-gcs-server` answers the preflight with 403 for the new header without the `-cors-headers` change (and 3 `reports.feature` scenarios fail), 200 with it; it doesn't enforce the range (a 10-byte body under `0,5` is stored), so the confirm check stays. Verified with a second `fake-gcs-server` container on :4453; the shared container wasn't recreated. `terraform plan`: the two buckets' CORS, plus task 068's `scaling` drift. Whether Cloud Storage enforces the header on V4 signed `PUT`s is for the preview hand check below. Lane 8: unit 576 passed, `test:storage` 6, the upload scenarios 23, full e2e 323 passed (`CI=1`, 2 workers), lint, typecheck and build green.

## Rollout (owner)
1. **Before the PR's preview runs the upload scenarios, and before the code reaches `main`:** from `infra/`, `terraform plan` (expect `google_storage_bucket.files` and `google_storage_bucket.files_preview` adding `x-goog-content-length-range` to `cors.response_header`, plus task 068's six cosmetic Cloud Run `scaling` diffs), then apply it, targeted at the two buckets (`-target=google_storage_bucket.files_preview -target=google_storage_bucket.files`) or in full (the `scaling` diffs are harmless). The new list is a superset, so the code already deployed keeps working.
2. Check: `gcloud storage buckets describe gs://<project>-files-preview --format="value(cors_config)"` (and `<project>-files`) lists the header.
3. Re-run the PR's preview job: the `@poc` flow uploads a photo and a report through the browser.
4. The hand check below on the preview, then merge.
5. **Locally, after merging** (every checkout and lane shares one storage container): `docker compose up -d storage` recreates `fake-gcs-server` with the new `-cors-headers` (objects stay in the `storagedata` volume). Until then the browser's preflight gets 403 and upload scenarios fail (seen in lane 8: 3 `reports.feature` scenarios).

## Hand check on the preview (real Cloud Storage)
Keeps the URL in a shell variable; the PR gets only the commands and status codes.
1. On the PR's preview, open a project, DevTools → Network → block requests to `storage.googleapis.com` ("Block request URL"), then "Add photos" with any small JPEG. The upload fails ("Couldn't add …") and the signed URL stays unused. Copy the blocked `PUT` request's URL into `URL` (`read -s URL`).
2. `head -c 22000000 /dev/urandom > /tmp/big.jpg` (21 MB, over the 20 MB photo limit).
3. `curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H 'Content-Type: image/jpeg' -H 'x-goog-if-generation-match: 0' -H 'x-goog-content-length-range: 0,20971520' --data-binary @/tmp/big.jpg "$URL"` → expect `400`.
4. No object: `gcloud storage objects describe "gs://<project>-files-preview/$(echo "$URL" | sed -E 's#^https://[^/]+/[^/]+/([^?]+).*#\1#')"` → not found.
5. Control, same URL: `head -c 1000 /dev/urandom > /tmp/small.jpg`, then step 3 with `@/tmp/small.jpg` → expect `200` (the URL was valid; the size was the reason). The object stays unconfirmed (task 087 cleans those up; the preview bucket deletes it after 14 days).
6. Leaving the header out: step 3 without `-H 'x-goog-content-length-range: …'`, on a fresh URL from step 1 → expect `403` (the header is signed, so a client can't drop it).

If step 3 returns `200`, Cloud Storage doesn't enforce the header on V4 signed `PUT`s: stop, and fall back as in "Open questions".

## Parking lot
- A per-workspace storage quota.
