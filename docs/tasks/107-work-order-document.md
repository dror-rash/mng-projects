# Task 107: The work order's document

- **Status:** todo
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `packages/db`, `apps/dashboard` (`features/attachments`, `features/work-orders`), `e2e`
- **Feature file:** `docs/features/work-orders.feature` (`@task:107`)
- **Depends on:** tasks 106 and 059 (attachments; done)

## Why
The customer's order usually arrives as a signed PDF or a photo, and it is the proof behind the work order (flow step 4).

## Scope
- **Migration (one):**
  - `attachment.kind` gains `work_order` and `attachment.work_order_id` (nullable → `work_order`), with a check that it is set exactly for that kind;
  - the attachment select policy and the `/attachments/<id>` access rule require `can_see_commercial` for that kind; creating and deleting one require `can_change_commercial`;
  - `delete_attachment` and `rls-pins.mjs` updated.
- **Upload:** "Upload the order" on a work order (admins), same types and size as files (task 059: PDF, Word, Excel, CSV, text, images, 50 MB), with the messages "Orders must be PDF, Word, Excel, CSV, text or images" and "Orders can be up to 50 MB". Several files per work order are allowed.
- The files show on the work order with a download link. They never show in "Photos and files" or "Reports".
- **Delete** (admins), restore from the Deleted page (kind "Order document"; "Restore its work order first").

## Out of scope
- Reading the order with OCR.
- E-signature.

## Acceptance criteria
- [ ] An admin uploads the order PDF to a work order and downloads it. ("I upload the order's document")
- [ ] The file is refused when too big or of another type. ("An order document must be a document, up to 50 MB")
- [ ] A worker and a partner user on the project get "not found" for its address, the same as a made-up one, and can't start an upload for it. ("The order document stays hidden from workers and partners")
- [ ] Delete and restore. ("I delete an order document, and restore it")

## Security notes
- Changes the attachment policies and the download route for a new kind. The risk is that a worker or partner reads a commercial file through the project-based rule. The kind-specific check must sit in both the policy and the route handler.
- Touches `route.ts`, upload code and policies, so the `security-reviewer` and `access-auditor` run.
- Signed URLs keep the size cap (task 085 when done).

## Approach (brief)
DB tests first (a worker and a partner can't select a `work_order` attachment of their own project). Reuse `startUploadAction` with the new kind.

## Test plan
- **Acceptance:** the `@task:107` scenarios, reusing `I add the file {string} with {string}`, `I add a {int} MB file {string} with {string}`, `I open the address of …` (a new `I open the address of the order document {string}`), `it is not found, the same as a made-up …`.
- **DB:** attachment policies per kind.
- **Unit:** `attachment-limits` (new kind).

## Open questions
1. **Allowed types:** *Default:* the same as files.

## Progress log
- 2026-11-11 – Drafted (`@wip`).

## Parking lot
- Purging deleted order files (with the attachments retention item).
