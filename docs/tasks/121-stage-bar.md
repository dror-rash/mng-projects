# Task 121: Stage bar and "Move to the next stage"

- **Status:** done (PR #127)
- **Milestone:** M22 Guided project flow
- **Zone / package:** `apps/dashboard` (`features/projects`, `messages/`), `e2e`
- **Feature file:** `docs/features/project-stages.feature` (`@task:121`, and three `@task:101` scenarios reworded at the start)
- **Depends on:** task 120 (done, PR #124): `NextStepCard` (`next-step-card.tsx`), `nextStep` (`next-step.ts`), `checklistFor` / `whoseMove` (`stage-checklist.ts`) and `listChecklistTicks` (`checklist-queries.ts`). `STAGE_PHASES` is shared with task 123: whichever of the two runs first adds it to `project-stage.ts` with its labels, the other reuses it.

## Why
The flow should be visible at a glance: which stages are behind the job, where it is now and what comes next, grouped as the owner thinks of it (Sales, Work, Closing). Moving on should be one button on the card that says what is next, with a warning when the checklist isn't done.

## Scope
- **Stage bar** at the top of the project page, under the header, for everyone who sees the project (a navigation-like group labelled "Stages" שלבים, *default*):
  - three phase headings: Sales מכירה (Inquiry, Quote, Ordered), Work ביצוע (Scheduled, In work), Closing סגירה (Reporting, Billing, Closed) (Hebrew *default*); the phases are a `const` list in `project-stage.ts` (`STAGE_PHASES`), with labels in the `projectStage` catalogue namespace;
  - stages before the current one show a check and "done" for screen readers, the current one is highlighted with the flame ring and `aria-current="step"`, later ones are muted;
  - for whoever can change the project, each stage other than the current one is a submit button in its own form that moves the project there at once, forward or back (no warning, ADR-0014 *default*), through task 101's `changeStageAction`; the current stage isn't a button. Others see the bar without buttons.
  - On a phone (360 px) the bar fits without the page scrolling sideways (the bar may scroll inside itself, keeping the current stage in view); in Hebrew it runs right to left.
- **Replaces** task 101's Stage select and "Change stage" button on the project page (`StageControl`'s form, which task 120 renders in `NextStepCard`'s `stageLine`). The "<Stage> since <date>" line stays in the "Next step" card. The new-project form keeps its Stage select.
- **"Move to <next stage>"** on the "Next step" card (e.g. "Move to Ordered" "העבר ל־הוזמן"), for whoever can change the project, when there is a next stage:
  - every item done: it moves at once;
  - items open: the page shows "{count, plural, one {1 item is} other {# items are}} still open in this stage. Move anyway?" with "Move anyway" and "Cancel" (*default* wording for one item); "Move anyway" moves, "Cancel" keeps the stage. The question comes back from the server action (`FormState`) and "Move anyway" posts again with a confirm field, so it works without JavaScript; the action checks the open items itself and never trusts the page's count.
  - At Closed there is no "Move to" button.
- **Errors:** a made-up stage posted from the bar: "Choose a stage" (task 101's message), shown above the bar.
- **A stale "Move to"** (*default*, task 121 review): "Move to <stage>" posts the stage it named; when the project isn't at the stage before it any more (another tab moved it), the action checks this before counting open items, moves nothing and redirects to the project page with no message: the page shown again with the real stage is the answer. The bar's buttons are deliberate moves and don't get this check.
- **Refusals for others** (access audit): a worker's or auditor's posted "Move to", "Move anyway" or bar move, and any post for another partner's project, get the made-up-id refusal ("Something went wrong") and never the open-items question or its count.
- **Reworded `@task:101` scenarios** (the task's first commit, a `docs(features):` commit saying why: the select and "Change stage" button go away):
  - "A made-up stage is refused": `I choose "Made up" in "Stage" by editing the page` and `I press "Change stage"` become `I move the project to the stage "Made up" by editing the page`;
  - "Who can change a stage": `the auditor sees no "Change stage" button` becomes `the auditor can't move the project to another stage`;
  - "A worker sees the stage but can't change it": `I see no "Change stage" button` becomes `I can't move the project to another stage`.

  `I change the stage to {string}` and `I post a stage change of {string} to {string}` keep their wording; their step code switches to the bar.
- **Storybook:** `StageBar` (each stage current, read-only, Hebrew, phone width); `NextStepCard` gains the button and the question.

## Out of scope
- Tabs (task 122), the stage board (task 123), "Needs action" (task 124).
- Blocking a move until the checklist is done (owner chose warn).
- Moving stages by dragging (parking lot).

## Acceptance criteria
- [ ] The bar shows the eight stages under three phases with done, current and later stages, and fits a phone. ("The stage bar shows where the project is")
- [ ] Choosing a stage on the bar moves the project, forward or back. (`@task:101` "I move a project to the next stage", "A stage can go back", their step now using the bar)
- [ ] With the checklist done, "Move to Ordered" moves without asking. ("Moving on when the checklist is done")
- [ ] With items open, the move asks first; Cancel keeps the stage and Move anyway moves. ("Moving on with open items asks first")
- [ ] At Closed there is no next stage to move to. ("At Closed there is no next stage")
- [ ] A made-up stage is refused; auditors and workers can't move the project; another partner's project can't be moved. (the three reworded `@task:101` scenarios, and "Another partner's project's stage can't be changed")
- [ ] A worker's posted "Move anyway" and an auditor's posted stage move are refused like a missing project, and the stage stays. ("A worker on the crew can't move the project by posting "Move anyway"", "An auditor can't move the project by posting the form")
- [ ] "Move to" posted for another partner's project is refused like a made-up id, without the open-items question. (""Move to" on another partner's project doesn't tell how many items are open")
- [ ] "Move to" from a page left open after another tab moved the project doesn't move it or ask about open items; the page shows the real stage (*default*: no message). (""Move to" from a page left open doesn't move the project back")

## Security notes
- No new data or access path: the bar and the button post to `changeStageAction` (`requireProjectAccess`, RLS on `project_stage_change`). The confirm field only skips the question; it grants nothing.
- Leak scenarios: an auditor and a worker see the bar without buttons and no "Move to" button; a partner's tampered post for another partner's project gets the made-up-id refusal. From the access audit: a crew worker's tampered "Move anyway", an auditor's tampered stage move, and a tampered "Move to" on another partner's project (which must not reveal the open-item count) are refused like a made-up id.
- Not a security-sensitive path; the `access-auditor` checks that the buttons render only with `canChange`.

## Approach (brief)
- `STAGE_PHASES` and `nextStage(stage)` in `project-stage.ts` (unit).
- `changeStageAction` gains the open-items check for posts that come from "Move to" (a `from: "next"` field) and the confirm field (unit in `stage-actions.test.ts`). It counts the open items with `checklistFor(stage)` against the project's ticks read inside its own `withAccess`, after locking the project row, never from the page.
- `StageBar` replaces `StageControl`'s form. Its forms post without JavaScript, and it uses `useActionState` like `StageControl`, so "Choose a stage" shows above the bar. `NextStepCard` gets the button as a small client island (`useActionState`) that shows the question; the card stays free of server code, the page passing the action as it passes `toggleAction` (task 120).

## Test plan
- **Acceptance:** `project-stages.feature` (`@task:121`, plus the `@task:101` scenarios).
- **New steps:**
  - `the stage bar shows {string} done, {string} current and {string} ahead` (stage lists);
  - `the stage bar shows the phases {string}`;
  - `I move the project to the stage {string} by editing the page` (a bar button's hidden value changed);
  - `I can't move the project to another stage` / `the auditor can't move the project to another stage` (no bar buttons, no "Move to" button);
  - `I cancel the move` (the question's "Cancel"; "I press" would also match "Cancel project");
  - `the {string} section has no button starting with {string}`;
  - `I post "Move to" on {string}` / `I post "Move anyway" on {string}` (a tampered "Move to" form, without / with the confirm field, from a decoy project of mine at the same stage, its project id set; sets `state.replay` for "the same as with a made-up id");
  - `the admin sees the project at the stage {string}` (the bar's current stage, not just the text: the bar always lists every stage name);
  - `the project {string} is moved to {string} in another tab` (a second tab presses the stage on the bar).
- **Changed step code (wording kept), audit:** `I post a stage change of {string} to {string}` must work for someone without bar buttons (the auditor): post from a decoy of mine, like `postFromDecoy`.
- **Reused:** `I press {string}`, `I see the text {string}`, `I do not see the text {string}`, `I see the error {string}`, `I reload the page`, `the {string} section shows {string}`, and from task 101 and 120's `project-stages.steps.ts`: `I see no {string} button`, `the project shows {string} since today`, `the checklist item {string} of {string} is ticked`, `I tick {string}`; `my screen is {int} pixels wide`, `the page does not scroll sideways`.
- **Changed step code (wording kept):** `I change the stage to {string}` and `I post a stage change of {string} to {string}` in `project-stages.steps.ts` press the bar's stage button (an exact name: "Quote" must not match "Move to Quote") instead of the select and "Change stage".
- **Unit:** `project-stage.test.ts` (phases, next stage), `stage-actions.test.ts` (question, confirm, Closed).
- **Storybook:** `StageBar`, `NextStepCard`.

## Open questions
None blocking. Defaults taken:
1. **Does choosing a stage on the bar warn about open items?** *Default:* no; only "Move to <next stage>" asks. The bar is the deliberate move by hand, as the select was.
2. **Phase names in Hebrew** (מכירה, ביצוע, סגירה) and the question's wording: *Default* as written; the owner reviews on the preview.
3. **The bar's group label:** *Default:* "Stages".
4. **A "Move to" from a stale page:** *Default:* nothing moves and the project page shows again with its real stage, without a message or the open-items question. The owner hasn't seen this; reviews on the preview.

## Progress log
- 2026-11-15 – Drafted with `@wip` scenarios in `project-stages.feature` (planner).
- 2026-11-16 – Readiness check against task 120 as merged (PR #124): dependencies and reused steps named after the real code; the bar and the button use `useActionState` so their messages show; `STAGE_PHASES` shared with task 123. READY (planner).
- 2026-11-16 – In progress in lane 1 (`feat/stage-bar`, database `app_lane1`, shell http://localhost:3010).
- 2026-11-16 – Three `@task:101` scenarios reworded (`docs(features)`); `@wip` removed from `@task:121`; bar, "Move to" and cancel steps written, the stage steps switched to the bar. Red run: every `@task:121` scenario fails on the missing bar or "Move to Ordered" button except "At Closed there is no next stage", which passes already (it checks an absence and task 120's "Job complete"); the reworded and bar-driven `@task:101` scenarios and "Ticks stay with their stage" fail on the missing bar (spec-writer).
- 2026-11-16 – Built (implementer): `STAGE_PHASES` (the same shape and `projectStage.phase` labels as task 123's lane), `nextStage`, `openItemCount`; `changeStageAction` asks first for `from=next` posts with open items unless `confirm=yes`, counting them after the row lock; `StageBar` under the header, `StageControl` reduced to `StageSince` (the line), `MoveToNextStage` on the "Next step" card (Cancel is a link back, dropping the question with JavaScript); messages in English and Hebrew; stories for `StageBar` (each stage, read-only, error, Hebrew, phone) and `NextStepCard` (button, question, Hebrew). Each unit test was run red before its code, but only the action's red is on record as its own commit (77365df, `test(dashboard)`): the `project-stage` and `stage-checklist` tests went in with their code in 3098526, and the component tests (`StageBar`, `MoveToNextStage`, `NextStepCard`, `nextStep`'s `moveTo`, `StageSince`) with theirs in 7acef77, since the commit guard's typecheck refuses imports of missing modules and exports. Step fix: "I can't move the project to another stage" looked for any "Move to" button on the page, and a crew worker has the task board's "Move to In progress" / "Move to Done"; it now looks in the "Next step" card (scenario unchanged). Unit: dashboard 83 files / 561 tests (all packages green). E2E: `@task:121` 4/4; `@task:121 or @task:101 or @task:120` 25/25.

- 2026-11-16 – Access audit (no leaks): three leak scenarios added; the stale "Move to" moved from the parking lot into scope (default: no move, the page shows the real stage, no message) with its scenario (`docs(features)`, not `@wip`) (planner).
- 2026-11-16 – Steps for the leak and stale-page scenarios (spec-writer): `I post "Move to" on {string}` / `I post "Move anyway" on {string}` and `I post a stage change of {string} to {string}` post from a decoy of mine (so the auditor and the crew worker get a real form), `the admin sees the project at the stage {string}` reads the bar's `aria-current="step"`, `the project {string} is moved to {string} in another tab`. Run (`@task:121 or @task:101`): the three leak scenarios and every other one pass; the scenario `"Move to" from a page left open doesn't move the project back` is red: the action asks about Scheduled's 3 open items and the page stays on "Quote since", because `from=next` isn't checked against the current stage yet.
- 2026-11-16 – Review fixes (implementer): a `from=next` post whose stage isn't the next one after the locked stage changes nothing and goes back to the project page, before counting (the stale-page scenario); the question carries no `values`; it is `role="alert"`, and Cancel puts focus back on "Move to"; the bar centres its current stage by setting its own `scrollLeft` (physical boxes, so right to left too) instead of `scrollIntoView`; the bar is focusable (`tabIndex=0`) when it has no buttons; phases are h3s under a visually hidden "Stages" h2 that names the group. Reds committed first this time (`test(dashboard)` before each fix).
- 2026-11-16 – In review: QA PASS (lint, typecheck, unit 565, db 194 + 27, build, Storybook, full e2e 360/372 with the 12 load failures passing alone after a dev-server restart). Main (task 123) merged in; 37/37 stage, checklist and board scenarios after the merge. Review fixes: a stale "Move to" changes nothing, the question is an alert, the bar scrolls only itself. Four leak and stale-page scenarios added.
- 2026-11-16 – Done: merged in PR #127.

## Parking lot
- Dragging a project between stages (bar or board).
- Warning on the bar too, if the owner finds jobs skipped by mistake.
- The stage bar on the customer page's project list.
