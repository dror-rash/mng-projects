# ADR-0012: Project stages and commercial records

- **Status:** accepted (owner, 2026-11-11)
- **Date:** 2026-11-11
- **Amends:** ADR-0006 (a new access rule for commercial records), ADR-0008 (no change to sites; recorded because inquiries rely on task 071's mandatory customer and site)

## Context
The owner's project flow (`docs/PLAN.md`, "Target flow") runs from an inquiry through a quote, a work order, scheduling, field work, reports and billing to the end of the job. Today a project has:
- `lifecycle` (`active` / `canceled`, set by hand, task 050);
- a status derived from its tasks (No tasks / Not started / In progress / Done / Canceled, `features/projects/project-status.ts`), shown as "Status" in the projects table.

Neither says where the job is in that flow. Task 071 made a customer and a site mandatory on every project, in the database.

Owner decisions (2026-11-11):
- an inquiry is a project at stage "Inquiry", created by a quick form that also creates the Lead customer and the site;
- every project type (work, expert opinion, arbitration) goes through the same stages;
- prices and costs: admins see everything, auditors read, workers and partners see neither.

## Decision
- **A stored stage:** `project.stage`, one of a `const` list in `features/projects/project-stage.ts` with `parseProjectStage`, translated labels (ADR-0011) and a default for unknown stored values. The stages, in order:
  - `inquiry` Inquiry
  - `quote` Quote
  - `ordered` Ordered
  - `scheduled` Scheduled
  - `in_work` In work
  - `reporting` Reporting
  - `billing` Billing
  - `closed` Closed

  A database check constraint keeps the column to that list.
- **Stage, lifecycle and progress are three separate things:**
  - `lifecycle` stays: canceling keeps the stage the project stopped at, so "canceled at Quote" stays visible;
  - the derived task status stays as the project's progress;
  - the projects table gets a "Stage" column and filter next to "Status". Renaming "Status" to "Progress" would change existing scenarios, so it is in the parking lot for the owner.
- **Changed by hand only:**
  - who can change a project's settings (`can_change_project`) moves its stage to any stage, forward or back;
  - nothing changes a stage silently;
  - later milestones may offer a move as part of an explicit action (for example "Accepted, move to Ordered" when recording a quote's acceptance), never on their own.
- **History:** `project_stage_change` (project, from, to, who, when), append-only: no update or delete grants. It is readable by whoever sees the project and written only by the stage action, in the same transaction as the change. The project page shows "<Stage> since <date>", and the timeline (task 108) lists the changes.
- **Existing projects** become `in_work` (canceled ones too, with their lifecycle kept). Projects created from "New project" start at `inquiry`, unless the form's Stage select says otherwise.
- **Inquiries keep task 071's rule:** an inquiry is a project, so it has a customer and a site. The quick inquiry form creates the Lead customer (or picks an existing one), its contact and a site (name required, address optional), and the project, in one transaction. The site can be corrected later. Nothing becomes nullable again.
- **Commercial records**, the first of which are the communications log (task 103) and work orders (tasks 106–107), followed by quotes, materials costs and bills:
  - a new SQL access function `can_see_commercial(workspace_id)`: true for admins and auditors of that workspace;
  - and `can_change_commercial(workspace_id)`: true for admins only;
  - in the existing style (`SECURITY DEFINER`, pinned `search_path`, `EXECUTE` for `app_user` only, pinned in `rls-pins.mjs`), reached in code through `features/access/`;
  - **workers and partner users never see commercial records, on their own projects too**, including files attached to them;
  - row-level security policies on every commercial table call these functions.
- **Project type:** `project.type` (`work`, `expert_opinion`, `arbitration`), a `const` list, the same stages for every type.

## Alternatives considered
- **Derive the stage from records** (a quote exists → Quote, a work order → Ordered): no extra input, but jobs skip and repeat steps (no quote for a small job, a second quote), and the owner tracks stages before the records exist. A derived value also can't move back by hand.
- **Fold the stage into `lifecycle`:** one column, but canceling would lose the stage it stopped at, and every existing lifecycle check and scenario would change.
- **A separate `inquiry` table that converts into a project:** no customer or site needed up front, but two lists, a convert step, and history split in two. Making customer and site nullable again would reverse task 071.
- **Stages per project type:** the owner said they are the same for every type, for now.
- **Partners see commercial records on their own projects:** rejected by the owner's decision on prices and costs. Partner-owned projects are handled commercially by the workspace's admins.

## Consequences
- **Good:**
  - one field answers "where is this job";
  - the filter and the history serve the follow-up views;
  - the commercial rule is defined once, before the first price exists.
- **Bad / trade-offs:**
  - "Stage" and "Status" side by side can confuse users until "Status" is renamed;
  - quick-creating a site with only a name makes placeholder sites possible;
  - partners lose sight of the commercial side of their own projects.
- **Follow-ups:**
  - automatic offers to move a stage (quotes milestone);
  - stage counts on the overview;
  - renaming "Status" to "Progress" (owner);
  - the money ADR for quotes (amounts, ILS, VAT), which uses `can_see_commercial`.
