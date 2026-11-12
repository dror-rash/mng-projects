# Task 105: New inquiry (customer, site and project in one form)

- **Status:** todo
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `packages/db`, `apps/dashboard` (new `features/inquiries`, `features/projects`), `e2e`
- **Feature file:** `docs/features/inquiries.feature` (`@task:105`)
- **Depends on:** tasks 101 and 103; ADR-0012 (inquiries keep task 071's mandatory customer and site)

## Why
Flow step 1: a customer calls, or the office reaches out. The owner chose (2026-11-11) to record it as a project at stage "Inquiry", from one quick form that also creates the Lead customer and the site, because task 071 requires both on every project.

## Scope
- **Migration (one):** `project.source` nullable text, check on (`inbound`, `outreach`); null for older projects. No policy change.
- **Page `/dashboard/inquiries/new`** (admins), linked as "New inquiry" from the overview and All projects. Fields:
  - **Customer:** "Existing customer" (select of top-level customers and sub-companies) or "New customer" (name; contact name, phone, email, all optional).
  - **Site:** for an existing customer, its sites or "New site"; for a new customer, always new. A new site has a name (required) and an address (optional).
  - **Project name** and **What they asked** (the project description).
  - **Who reached out:** "They contacted us" (`inbound`) or "We contacted them" (`outreach`).
  - **Channel** (as task 103) and **Date** (default today).
- **One transaction creates:** the customer (status Lead) and its contact if new, the site if new, the project at stage Inquiry with its source (and its first stage-history row), and a first communication on the project: direction `in` for inbound, `out` for outreach, summary = what they asked, the contact if one was entered. It lands on the project page.
- **Errors:**
  - "Enter the customer's name";
  - "Choose a customer";
  - "Enter a site name";
  - "Choose a site of this customer";
  - "Project name is required";
  - "Choose who reached out";
  - "The date can't be in the future";
  - plus the contact's email check.

  Any error creates nothing.
- **Project page:** "Inquiry: they contacted us" or "Inquiry: we contacted them" next to the stage when a source is set.

## Out of scope
- Converting an existing customer's status from Lead to Active (done by hand on the customer page).
- Duplicate-customer detection (parking lot).
- Partners creating inquiries.

## Acceptance criteria
- [ ] An inquiry from a new caller creates the Lead customer with its contact, the site, the project at Inquiry and the first communication. ("An inquiry from a new customer")
- [ ] An inquiry for an existing customer uses one of its sites. ("An inquiry from an existing customer at one of its sites")
- [ ] Our own outreach is recorded as outgoing. ("Our outreach to a customer")
- [ ] Missing fields show their errors and create nothing. ("An inquiry with missing details creates nothing")
- [ ] Auditors, workers and partner users have no "New inquiry" link, and posting the form is refused. ("Only admins record inquiries")

## Security notes
- Creates customers, sites, projects and a commercial record in one action: admins only (`isAdmin`, `can_change_customer`, `can_change_site`, `can_change_commercial`), each enforced by RLS too.
- The workspace comes from the posted `workspaceId` (`requireWorkspaceForAction`).
- A chosen customer or site must be one the admin can see in that workspace (`site_choice`).
- Leak scenarios: a partner and an auditor posting the form.
- Migration without grants or policies; the action touches several access paths, so the `access-auditor` runs.

## Approach (brief)
- Parser first (unit: every branch of new or existing customer and site).
- Then one action reusing the create functions of customers, sites, projects (with the stage row) and communications inside one `withAccess` transaction.

## Test plan
- **Acceptance:** `inquiries.feature`.
- **New steps:**
  - `I record an inquiry from the new customer {string} with the contact {string} at the new site {string} for {string}`;
  - `I choose "They contacted us"` reuses `I check {string}`.
- **Unit:** `inquiry-input.test.ts`.
- **Storybook:** `InquiryForm` (new customer, existing customer).

## Open questions
1. **Site for a caller whose address isn't known yet:** *Default:* a site name is required (e.g. "Main site"), the address optional, and it is corrected later.
2. **Who records inquiries?** *Default:* admins only.

## Progress log
- 2026-11-11 – Drafted with `inquiries.feature` (`@wip`). Keeps task 071's rule: no project without a customer and a site (ADR-0012).

## Parking lot
- "A customer with this name or phone already exists" when creating a new one.
- A quick inquiry from a phone, with fewer fields.
- Turning a Lead into Active automatically when the project reaches Ordered.
