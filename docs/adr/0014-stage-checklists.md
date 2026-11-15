# ADR-0014: Stage checklists and "whose move"

- **Status:** accepted (owner, 2026-11-15, as proposed, defaults included; records the owner-approved design of 2026-11-15)
- **Date:** 2026-11-15
- **Amends:** ADR-0012 (adds a checklist to each stage; the stages, their order and the access rules stay)

## Context
Task 101 gave every project one of eight stages (ADR-0012) and a line "<Stage> since <date>" with a Stage select. The owner raised on 2026-11-15 that the project page doesn't say what a stage needs, what comes next or who has to act, and approved a design (milestone M22, "Guided project flow"):
- a stage bar with the eight stages under three phases (Sales, Work, Closing);
- a "Next step" card for the current stage with a fixed checklist, each item marked "us" or "customer", and a badge saying whose move it is;
- the same badge on a stage board and in a "Needs action" list on the overview.

That needs somewhere to keep which items are done, a rule for the badge, and a rule for who sees and ticks items.

## Decision
- **The items are fixed in code**, per stage, in `features/projects/stage-checklist.ts`: a `const` list of `{ key, stage, party }` in display order, `party` being `us` or `customer`, with labels in the catalogues (ADR-0011). The 20 items and their texts are the owner's (task 120). A database check keeps stored keys to that list, as with `project.stage`.
- **Ticks are stored per project and item:** `project_checklist_tick` (`project_id` → project on delete cascade, `item`, `ticked_by` → user on delete set null, `ticked_at` the database's time), primary key (`project_id`, `item`). Ticking inserts a row, unticking deletes it. Ticks stay when the stage moves, so going back to a stage shows its items as they were. *Default:* no history of unticks (the timeline, task 108, may add one later).
- **"Whose move" is derived, never stored:** for the current stage, the first open item in display order decides it: an `us` item gives "Our move", a `customer` item "Waiting for customer"; when every item is done the badge is "Ready for next stage" (at Closed, *default:* "Job complete", since there is no next stage). One pure function, `whoseMove(stage, doneItems)`, serves the project page, the stage board and the overview.
- **The checklist advises, it doesn't block** (owner, 2026-11-15): "Move to <next stage>" with open items asks "N items still open in this stage. Move anyway?" and moves if confirmed. *Default:* choosing a stage on the stage bar moves at once, as the Stage select does today; it is the deliberate move by hand. ADR-0012 stands: every move is a `project_stage_change` row, and nothing moves a stage on its own.
- **Access follows the stage's, not the commercial rule** (*default*, from ADR-0012: "Stage isn't commercial"): items are status flags without amounts or conversation content.
  - Whoever sees the project sees the checklist and the badge (`can_see_project`), workers and partner users included.
  - Whoever can change the project ticks and unticks (`can_change_project`): admins, and partner users on their own partner's projects, like the stage itself. Auditors and workers read only.
  - Row-level security: select with `can_see_project`, insert (as oneself, without `ticked_at`) and delete with `can_change_project`, no update grant; pinned in `rls-pins.mjs`. The app writes through a `@repo/db` helper, like `recordStageChange`.
- **"Waiting since"** (for the overview's "Needs action", task 124) is the later of the day the current stage started and the latest tick among its items. The stage board shows days in the current stage (since the stage started).

## Alternatives considered
- **Items as rows per workspace (editable checklists):** what the owner wants eventually, but it needs an editor, versioning when a workspace changes items mid-job, and translations typed by admins. Parked (owner-approved); the fixed keys can be copied into such a table later.
- **Derive the ticks from records** (a work order exists → "Work order" ticked): the records for most items don't exist yet (quotes M16, reports M17, bills M19). Later milestones may tick items as part of an explicit action; parked.
- **Block a move while items are open:** the owner chose warn, not block: jobs skip steps (no quote for a small job).
- **A stored "whose move" column:** would drift from the ticks; deriving it costs nothing at these sizes.
- **Checklists as commercial records** (admins and auditors only): would hide the stage's progress from the partner users who move their own projects' stages, and from crews; the items carry no prices.
- **Keep an event per tick and untick:** a full audit trail, but nothing reads it yet; the current state with who and when is what the card shows.

## Consequences
- **Good:**
  - one rule for "whose move" across the project page, the board and the overview;
  - the owner's checklist texts live in the catalogues in both languages;
  - no new access function; the stage's rules cover it.
- **Bad / trade-offs:**
  - changing an item's text is a catalogue change; adding or removing an item is a code change plus a migration for the check;
  - unticking leaves no trace;
  - a partner user can tick "Quote sent" on their project though quotes stay hidden from them (ADR-0012); partner-owned projects are handled commercially by admins.
- **Follow-ups:**
  - per-workspace checklist items (parking lot, owner);
  - ticking items from records (work orders, quotes, reports, bills) as explicit actions in M15–M19;
  - ticks in the timeline (task 108).
