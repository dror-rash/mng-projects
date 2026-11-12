# Task 103: Communication log (calls, emails, WhatsApp, meetings)

- **Status:** todo
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `packages/db`, `apps/dashboard` (new `features/communications`, `features/access`, `features/deleted`), `e2e`
- **Feature file:** `docs/features/customer-communications.feature` (`@task:103`)
- **Depends on:** task 094; ADR-0012 (commercial records); tasks 014 and 016 (contacts, projects of a customer; done)

## Why
Flow step 12: the office tracks customers' phone calls, emails and WhatsApp messages. For now they are logged by hand (owner's default, 2026-11-11), on the customer and, when it is about a job, on the project.

## Scope
- **Migration (one):**
  - **Access functions** `can_see_commercial(workspace_id)` (admins and auditors) and `can_change_commercial(workspace_id)` (admins), in the style of migration 0018 (`SECURITY DEFINER`, `search_path = public, pg_temp`, `EXECUTE` for `app_user` only).
  - **Table `communication`:**
    - `id`, `workspace_id`, `organization_id` (the customer, a parent or sub-company; composite key with the workspace), nullable `project_id` (a project of that customer), nullable `contact_id` (a contact of that customer);
    - `channel` (`phone`, `email`, `whatsapp`, `meeting`, `other`), `direction` (`in`, `out`), `occurred_on` date, `summary` text not null, nullable `follow_up_on` date, nullable `follow_up_done_at`;
    - `created_by`, timestamps, soft-delete columns.
    - Triggers refuse a project or contact of another customer (and another workspace).
  - **RLS:** select with `can_see_commercial`, insert and update with `can_change_commercial`, no delete grant.
  - `rls-pins.mjs` updated.
- **`features/communications/`:** channel and direction const lists with labels (Phone שיחת טלפון, Email אימייל, WhatsApp וואטסאפ, Meeting פגישה, Other אחר; From the customer נכנס, To the customer יוצא), a parser (unit tested), queries, actions.
- **Customer page:** a "Communications" section, newest first. Each entry shows date, channel, direction, contact, project link, summary, author and follow-up date. A "Log a communication" form (admins) has:
  - Channel, Direction, Date (default today), Contact (the customer's contacts, optional), Project (the customer's projects, optional), Summary, Follow up on (optional).
- **Project page:** the same section with that project's entries; its form fixes the project and the project's customer.
- **Edit and delete:** the author and admins (in practice admins). Delete is soft; admins restore from the Deleted page (kind "Communication"), which needs the customer not deleted ("Restore its customer first").
- **Errors:**
  - "Write what was said" (empty summary);
  - "The date can't be in the future";
  - "Choose a contact of this customer";
  - "Choose a project of this customer";
  - "Choose a channel".

## Out of scope
- Follow-ups on the overview (task 104).
- Capturing emails, calls or WhatsApp automatically (later, external services).
- The timeline (task 108).
- Moving existing customer notes into the log.

## Acceptance criteria
- [ ] An admin logs a phone call from the customer's contact about a project; it shows on the customer and on the project. ("I log a phone call about a project")
- [ ] Logging from the project page picks its customer and project. ("Logging from a project page")
- [ ] The summary is required and the date can't be in the future. ("A communication needs a summary and a date not in the future")
- [ ] Edit, delete and restore. ("I edit and delete an entry, and restore it")
- [ ] The auditor reads the log without forms. ("The auditor reads the log")
- [ ] Workers and partner users see no communications on their own projects, and posting one is refused like a made-up id. ("Workers and partners see no communications")
- [ ] A contact or project of another customer is refused. ("A contact or project of another customer is refused")

## Security notes
- Customers' conversations are commercial records (ADR-0012): admins and auditors only, never workers or partner users, their own projects included.
- New definer functions, grants and policies, so the `security-reviewer` and `access-auditor` run.
- Leak scenarios cover a worker on the crew, a partner user on their own project, and a posted form from each.
- Summaries may hold personal data (names, phone numbers): never logged.

## Approach (brief)
- DB tests first: the functions per role, the policies, the triggers.
- Then the parser (unit), the actions under `withAccess`, then the sections.
- ADR-0012 covers the access rule; no new ADR.

## Test plan
- **Acceptance:** `customer-communications.feature` (`@task:103`), using the two-partner workspace background.
- **New steps:**
  - `I log a {string} {string} with {string} saying {string}` (channel, direction, contact, summary);
  - `the communications listed are {string}`;
  - `the {string} user sees no {string} section on {string}`;
  - `I post a communication for {string}`.
- **DB:** `communications.db.test.ts`.
- **Unit:** `communication-input.test.ts`.
- **Storybook:** `CommunicationsSection` (entries, empty, read-only).

## Open questions
1. **Who sees communications?** *Default:* admins and auditors only (commercial, ADR-0012); workers and partner users never, their own projects included.
2. **Keep customer notes separate from the log?** *Default:* yes: notes are general information, the log is dated contact.
3. **A time of day on entries?** *Default:* no, a calendar day only (time zones, task 041, are still open).

## Progress log
- 2026-11-11 – Drafted with `customer-communications.feature` (`@wip`).

## Parking lot
- Attachments on an entry (a screenshot of a WhatsApp message, an email file).
- Logging from a contact's row ("Called").
- A log across all customers with filters.
