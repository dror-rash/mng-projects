# Task 120: Stage checklist and the "Next step" card

- **Status:** in-progress
- **Milestone:** M22 Guided project flow
- **Zone / package:** `packages/db`, `apps/dashboard` (`features/projects`, `messages/`, demo seed), `e2e`
- **Feature file:** `docs/features/project-stages.feature` (`@task:120`)
- **Depends on:** task 101 (done, PR #111); task 094 (done); ADR-0014 (accepted by the owner, 2026-11-15)

## Why
The owner (2026-11-15): the project page says which stage a job is at, but not what that stage needs or who has to act. A checklist per stage with a "whose move" badge answers both, on the page the office already opens.

## Scope
- **Migration (one):** `project_checklist_tick`:
  - `project_id` → project on delete cascade, `item` text with a check on the 20 keys below, `ticked_by` → user on delete set null, `ticked_at` timestamp default now(); primary key (`project_id`, `item`);
  - RLS: select with `can_see_project`; insert with `can_change_project` and `ticked_by` the current user; delete with `can_change_project`; no update grant; `app_user` may insert every column but `ticked_at` (the database's time, as task 101's `changed_at`);
  - a `@repo/db` helper `tickChecklistItem` (a Drizzle insert names every column, see `recordStageChange`), and `untickChecklistItem`;
  - `rls-pins.mjs` updated.
- **`features/projects/stage-checklist.ts`:** `STAGE_CHECKLIST`, a `const` list of `{ key, stage, party }` in display order (`party`: `us` or `customer`); `parseChecklistItem`; `checklistFor(stage)`; `whoseMove(stage, doneKeys)` returning `our_move`, `waiting_for_customer`, `ready` or, at Closed with everything done, `complete` (ADR-0014). Labels in the `stageChecklist` catalogue namespace (en and he):

  | Key | Stage | Party | English | Hebrew (owner) |
  |---|---|---|---|---|
  | `inquiry.details_recorded` | Inquiry | us | Customer and site details recorded | פרטי לקוח ואתר נרשמו |
  | `inquiry.logged` | Inquiry | us | Inquiry logged in the communications log | הפנייה תועדה ביומן התקשורת |
  | `quote.costed` | Quote | us | Materials and labour costed | תמחיר חומרים וכוח אדם |
  | `quote.sent` | Quote | us | Quote sent to the customer | ההצעה נשלחה ללקוח |
  | `quote.accepted` | Quote | customer | Customer accepted the quote | הלקוח אישר את ההצעה |
  | `ordered.work_order` | Ordered | customer | Work order from an authorised person at the customer | הזמנת עבודה מגורם מוסמך מטעם הלקוח |
  | `ordered.payment_terms` | Ordered | us | Payment terms agreed | תנאי תשלום סוכמו |
  | `scheduled.date_set` | Scheduled | us | Work date set | נקבע מועד לעבודה |
  | `scheduled.crew_assigned` | Scheduled | us | Crew assigned | צוות שובץ |
  | `scheduled.customer_confirmed` | Scheduled | customer | Customer confirmed the date | הלקוח אישר את המועד |
  | `in_work.visits_done` | In work | us | Site visits done | ביקורים בשטח בוצעו |
  | `in_work.materials_reported` | In work | us | Materials from suppliers reported on the project | חומרים מספקים דווחו לפרויקט |
  | `in_work.reports_handed_over` | In work | us | Field reports handed over to the office | דוחות השטח נמסרו למשרד |
  | `reporting.prepared` | Reporting | us | Report prepared in the office | הדוח הוכן במשרד |
  | `reporting.sent` | Reporting | us | Report sent to the customer | הדוח נשלח ללקוח |
  | `reporting.received` | Reporting | customer | Customer confirmed receiving the report | הלקוח אישר קבלת הדוח |
  | `billing.prepared` | Billing | us | Bill or invoice prepared | חשבון / חשבונית הוכנו |
  | `billing.sent` | Billing | us | Sent to the customer | נשלחו ללקוח |
  | `billing.received` | Billing | customer | Customer confirmed receipt | הלקוח אישר קבלה |
  | `closed.completion_report` | Closed | us | Work-completion report prepared and sent | דוח סיום עבודה הוכן ונשלח |

  The party tags: Us אנחנו, Customer לקוח (*default*). The badges: Our move תורנו, Waiting for customer ממתין ללקוח, Ready for next stage מוכן לשלב הבא, Job complete העבודה הושלמה (Hebrew *default*, the owner reviews on the preview).
- **Project page, a "Next step" section** (a region named by its heading "Next step" הצעד הבא) under the header, for everyone who sees the project:
  - "<Stage> since <date>" moves into it (task 101's line, unchanged text);
  - the whose-move badge (amber for Our move, blue for Waiting for customer, green for Ready for next stage and Job complete, from the palette tokens of task 118);
  - "N of M done" ("{done} of {total} done", Hebrew "{done} מתוך {total} בוצעו");
  - the current stage's items in order, each with its party tag; a done item shows who ticked it and the day ("<name>, <date>"; the date alone when that user is deleted).
  - For whoever can change the project, each item is a submit button in its own form (`aria-pressed`, a check box drawn in it), so it works before hydration (task 114). Pressing it ticks or unticks; the page shows the new state. Others see the same list without buttons.
  - The Stage select and "Change stage" stay as they are; task 121 replaces them.
- **Actions:** `toggleChecklistItemAction` (`features/projects/checklist-actions.ts`): `requireProjectAccess` for a change, then the helper, inside `withAccess`. An unknown item key: "Choose an item of the checklist" (*default*). An item of another stage than the current one is accepted (*default*: done is done; the card only shows the current stage's items). Ticking a ticked item or unticking an open one changes nothing.
- **Lifecycle:** a canceled project shows the card as usual and its items can still be ticked (*default*, like its stage, task 101).
- **Copy:** a copy starts at Inquiry with no ticks (*default*).
- **Demo seed:** each demo project gets some ticks in its current stage, so the badges vary.

## Out of scope
- The stage bar and "Move to <next stage>" with its warning (task 121).
- Tabs on the project page (task 122), the stage board (task 123), "Needs action" (task 124).
- Ticking items automatically from records (parking lot).
- Editing the items per workspace (parking lot, owner-approved).

## Acceptance criteria
- [ ] The card lists the current stage's items with their party, "0 of 3 done" and "Our move". ("The next step card shows the stage's checklist")
- [ ] Ticking items moves the badge to "Waiting for customer", then "Ready for next stage". ("Ticking items changes whose move it is")
- [ ] A ticked item shows who ticked it and when; unticking reopens it. ("A ticked item shows who ticked it, and can be unticked")
- [ ] Ticks stay with their stage when the project moves on and back. ("Ticks stay with their stage")
- [ ] A partner user ticks their own project's items; the auditor and a crew worker see the checklist without buttons. ("Who can tick the checklist", "A worker sees the checklist but can't tick it")
- [ ] A tick posted for another partner's project is refused like a made-up id. ("Another partner's checklist can't be ticked")
- [ ] The checklist reads in Hebrew with the owner's texts. ("The checklist in Hebrew")

## Security notes
- A new table under `can_see_project` / `can_change_project` (ADR-0014). Not commercial: workers and partner users see it on their projects; only those who can change the project write it.
- Append-or-delete only, no update; `ticked_at` is the database's time; `ticked_by` must be the current user.
- Migration with grants and policies, so the `security-reviewer` runs; the `access-auditor` checks the action.
- Leak scenarios: a worker and an auditor have no tick buttons; a partner posting a tick for another partner's project gets the made-up-id refusal. DB tests cover an auditor's and a worker's insert and delete.

## Approach (brief)
- DB tests first (`stage-checklist.db.test.ts`: policies per role, the check on keys, no update, `ticked_at`, cascade on project delete, a deleted user's ticks kept with `ticked_by` null in `user-delete.db.test.ts`).
- Then `stage-checklist.ts` (unit: `whoseMove` for every case), the action, then `NextStepCard` in `features/projects/` with its story.
- ADR-0014 (this task).

## Test plan
- **Acceptance:** `project-stages.feature` (`@task:120`).
- **New steps:**
  - `I tick {string}` / `I untick {string}` (the item's button on the project page);
  - `the checklist items are {string}` (in order);
  - `{string} is ticked by me today` / `{string} is not ticked`;
  - `I can't tick the checklist` and `the auditor can't tick the checklist` (the "Next step" section has no item buttons);
  - `the checklist item {string} of {string} is ticked` (Given, in the database, as an admin of the workspace);
  - `I post a tick of {string} on {string}` (leak, like `I post a stage change of {string} to {string}`).
- **Reused:** `the {string} section shows {string}`, `the project {string} is at the stage {string}`, `I change the stage to {string}`, `the project shows {string} since today`, `I see {string}, the same as with a made-up id`, `my language cookie is set to {string}`, the two-partner background.
- **DB:** `stage-checklist.db.test.ts`, `user-delete.db.test.ts`.
- **Unit:** `stage-checklist.test.ts` (keys match the migration's check, every stage has items, `whoseMove`), `checklist-actions.test.ts`, the catalogue test (en and he keys).
- **Storybook:** `NextStepCard` (each badge, read-only, a deleted ticker, Hebrew).

## Open questions
None blocking. Defaults taken (owner may change them in review):
1. **Who sees and ticks the checklist?** *Default:* like the stage: everyone who sees the project sees it; whoever can change the project (admins, partner users on their own projects) ticks. Auditors and workers read (ADR-0014).
2. **Badge and tag texts in Hebrew** (תורנו, ממתין ללקוח, מוכן לשלב הבא, העבודה הושלמה, אנחנו, לקוח, הצעד הבא): *Default:* as written; the item texts are the owner's.
3. **English item texts:** translated from the owner's Hebrew; the owner reviews on the preview.
4. **At Closed with the item done:** *Default:* "Job complete" instead of "Ready for next stage".
5. **Unticking:** *Default:* allowed for whoever can tick; no trace kept.
6. **Ticks on a copy:** *Default:* none.

## Progress log
- 2026-11-15 – Drafted with `@wip` scenarios in `project-stages.feature` and ADR-0014 (planner).
- 2026-11-16 – In progress in lane 1 (`feat/stage-checklist`, database `app_lane1`, shell http://localhost:3010).
- 2026-11-16 – Steps written, `@wip` removed; red run: all 8 `@task:120` scenarios fail on the missing "Next step" checklist (and the missing `project_checklist_tick` table) (spec-writer).
- 2026-11-16 – Implemented in lane 1 (implementer): migration 0046 `project_checklist_tick` with RLS and `tickChecklistItem` / `untickChecklistItem` (DB tests per role, keys, time, cascade, deleted user; `rls-pins.mjs`); `stage-checklist.ts` (unit); `toggleChecklistItemAction` (unit; a made-up item throws, the form being a single button, like a made-up task status); `listChecklistTicks` (DB test, a copy has no ticks); `NextStepCard` with its story; en/he catalogue; demo seed ticks. The step `nextStep` now finds the region by its Hebrew name too (the task names the heading הצעד הבא; the scenario is unchanged). All 8 `@task:120` scenarios pass. Locally, the first scenarios of a run time out while cold dev servers compile (the same with `@task:101` on `main`'s code); runs against warm lane servers pass.

## Parking lot
- Ticking items from records as an explicit action: "Work order from an authorised person" when a work order is recorded (task 106), "Quote sent" / "Customer accepted the quote" from quotes (M16), report delivery (M17), bills (M19), "Crew assigned" from the crew list.
- Per-workspace checklist items (owner-approved to park): an editor, versions, translations.
- Ticks and unticks in the timeline (task 108).
- Required items before a stage can move (today: warn only, task 121).
