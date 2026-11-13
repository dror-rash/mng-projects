# Task 108: Project and customer timeline

- **Status:** todo
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `apps/dashboard` (new `features/timeline`), `e2e`
- **Feature file:** `docs/features/timeline.feature` (`@task:108`)
- **Depends on:** tasks 101, 103 and 106

## Why
Following a job from inquiry to close means reading one history, not five sections: stage changes, conversations, the work order, visits and reports in date order.

## Scope
- **Project page, "Timeline" section**, newest first, up to 50 entries with "Show more":
  - stage changes ("Stage: Inquiry → Quote", who, when);
  - communications;
  - work orders recorded;
  - visits;
  - reports uploaded.

  Each entry links to its record.
- **Customer page, "Timeline" section:** its communications, notes, and the stage changes of its projects (with the project's name).
- **Per-role filtering:** each entry type is read through its own access rules. Workers and partner users see stage changes, visits and reports, never communications or work orders (ADR-0012). Auditors see everything.
- No migration: one query unions the sources inside `withAccess`, so RLS filters each part.

## Out of scope
- A workspace-wide activity feed.
- Changes to tasks in the timeline (parking lot).
- An audit log of edits.

## Acceptance criteria
- [ ] An admin sees the project's stage change, communication, work order and visit in date order. ("The project timeline tells the job's story")
- [ ] A crew worker and a partner user see the stage changes and visits but no communications or work orders. ("The timeline shows each person only what they may see")
- [ ] The customer page timeline shows communications, notes and its projects' stage changes. ("The customer timeline")

## Security notes
A read-only union over commercial and non-commercial tables. The risk is a query path that skips RLS or a predicate. Every part runs inside `withAccess`, and the leak scenario checks a worker and a partner. The `access-auditor` runs; no security-sensitive paths.

## Approach (brief)
One `listTimeline(projectId)` query with a `kind` column, mapped to entries in code (unit test on the mapping), then a `Timeline` component.

## Test plan
- **Acceptance:** `timeline.feature`.
- **New step:** `the timeline shows {string}`: the listed texts appear in the Timeline section in that order (other entries, such as the project's creation, may sit between them). The Given steps that set a stage record a history row from the project's current stage, as the action does; projects written by fixtures start at Inquiry (the column default).
- **Unit:** entry mapping.
- **Storybook:** `Timeline` (all kinds, read-only roles, empty).

## Open questions
1. **Include task changes** (created, done) in the project timeline? *Default:* not yet; it would need a task history.

## Progress log
- 2026-11-11 – Drafted with `timeline.feature` (`@wip`).

## Parking lot
- Task events in the timeline.
- Quotes, materials and bills as they arrive (M16–M19).
