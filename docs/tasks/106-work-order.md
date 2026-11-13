# Task 106: Work order and payment terms

- **Status:** todo
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `packages/db`, `apps/dashboard` (new `features/work-orders`, `features/organizations/contacts`, `features/deleted`), `e2e`
- **Feature file:** `docs/features/work-orders.feature` (`@task:106`)
- **Depends on:** tasks 101 and 103 (`can_see_commercial`); ADR-0012

## Why
Flow step 4: the customer orders the work through an authorised person, and the payment terms are agreed. The office needs it on record before scheduling and billing.

## Scope
- **Migration (one):**
  - `organization_contact.can_order` boolean not null default false;
  - `work_order`: `id`, `workspace_id`, `project_id`, `order_number` (nullable text), `ordered_on` date, `ordered_by_contact_id` (a contact of the project's customer or of its parent or sub-companies), `payment_terms` (`immediate`, `net_30`, `net_60`, `net_90`, `other`), `payment_terms_note`, `notes`, `created_by`, timestamps, soft-delete columns;
  - a trigger refuses a contact of another customer group or workspace;
  - RLS: select with `can_see_commercial`, insert and update with `can_change_commercial`, no delete grant;
  - `rls-pins.mjs` updated.
- **Contacts:** an "Authorised to order" checkbox on the contact form; "Authorised to order" shows on the contact. Visible to those who see contacts today.
- **Project page:** a "Work orders" section (admins and auditors), newest first, with order number, date, ordered by, payment terms. "Record a work order" (admins) opens a form:
  - Order number (optional), Ordered on (default today, not in the future);
  - Ordered by: only contacts marked "Authorised to order". If none: "No one at <customer> is authorised to order yet." with a link to the customer page;
  - Payment terms: Immediate מיידי, Net 30 שוטף+30, Net 60 שוטף+60, Net 90 שוטף+90, Other אחר. "Other" needs a note;
  - Notes.
- **Edit and delete** (admins); restore from the Deleted page (kind "Work order"; "Restore its project first").
- **Errors:**
  - "Choose who ordered";
  - "Choose someone authorised to order" (a contact not marked, or of another customer);
  - "The order date can't be in the future";
  - "Choose payment terms";
  - "Describe the payment terms" (Other without a note).
- The stage doesn't move by itself (ADR-0012). After saving, the page offers "Move to Ordered" when the stage is before Ordered.

## Out of scope
- The order document upload (task 107).
- Amounts (the quotes and billing milestones).
- E-signature.

## Acceptance criteria
- [ ] An admin marks a contact authorised and records a work order with Net 30; it shows on the project with "Move to Ordered". ("I record a work order from an authorised contact")
- [ ] Without an authorised contact the form says so; a contact who isn't authorised is refused. ("Only an authorised contact can order")
- [ ] "Other" payment terms need a note; the date can't be in the future. ("A work order's terms and date are checked")
- [ ] Delete and restore. ("I delete a work order, and restore it")
- [ ] The auditor reads work orders; workers and partner users see no Work orders section on their own projects, and posting one is refused. ("Who sees work orders")

## Security notes
- Commercial record (ADR-0012): admins write, auditors read, workers and partner users never, their own projects included.
- The new contact flag is shown only where contacts are shown today (partners and workers don't see customer contacts).
- Migration with grants, policies and a trigger, so the `security-reviewer` and `access-auditor` run.
- Leak scenarios as above.

## Approach (brief)
DB tests (policies, trigger), parser (unit), actions, section. Reuses `can_see_commercial` from task 103.

## Test plan
- **Acceptance:** `work-orders.feature`.
- **New steps:**
  - `the contact {string} is authorised to order`;
  - `I record a work order {string} from {string} with the terms {string}`;
  - `the work orders listed are {string}`.
- **DB:** `work-orders.db.test.ts`.
- **Unit:** `work-order-input.test.ts`.
- **Storybook:** `WorkOrdersSection`, `WorkOrderForm`.

## Open questions
1. **Only authorised contacts may order?** *Default:* yes; mark them on the customer page.
2. **More than one work order per project** (additional orders)? *Default:* yes, a list.
3. **Payment terms list:** *Default:* Immediate, Net 30, Net 60, Net 90 (שוטף+), Other with a note.

## Progress log
- 2026-11-11 – Drafted with `work-orders.feature` (`@wip`).

## Parking lot
- Default payment terms per customer.
- An order amount (with the money ADR).
- A signed order (e-signature, external service).
