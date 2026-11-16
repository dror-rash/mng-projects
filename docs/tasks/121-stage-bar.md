# Task 121: Stage bar and "Move to the next stage"

- **Status:** todo
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

## Security notes
- No new data or access path: the bar and the button post to `changeStageAction` (`requireProjectAccess`, RLS on `project_stage_change`). The confirm field only skips the question; it grants nothing.
- Leak scenarios: an auditor and a worker see the bar without buttons and no "Move to" button; a partner's tampered post for another partner's project gets the made-up-id refusal.
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
  - `the {string} section has no button starting with {string}`.
- **Reused:** `I press {string}`, `I see the text {string}`, `I do not see the text {string}`, `I see the error {string}`, `I reload the page`, `the {string} section shows {string}`, and from task 101 and 120's `project-stages.steps.ts`: `I see no {string} button`, `the project shows {string} since today`, `the checklist item {string} of {string} is ticked`, `I tick {string}`; `my screen is {int} pixels wide`, `the page does not scroll sideways`.
- **Changed step code (wording kept):** `I change the stage to {string}` and `I post a stage change of {string} to {string}` in `project-stages.steps.ts` press the bar's stage button (an exact name: "Quote" must not match "Move to Quote") instead of the select and "Change stage".
- **Unit:** `project-stage.test.ts` (phases, next stage), `stage-actions.test.ts` (question, confirm, Closed).
- **Storybook:** `StageBar`, `NextStepCard`.

## Open questions
None blocking. Defaults taken:
1. **Does choosing a stage on the bar warn about open items?** *Default:* no; only "Move to <next stage>" asks. The bar is the deliberate move by hand, as the select was.
2. **Phase names in Hebrew** (מכירה, ביצוע, סגירה) and the question's wording: *Default* as written; the owner reviews on the preview.
3. **The bar's group label:** *Default:* "Stages".

## Progress log
- 2026-11-15 – Drafted with `@wip` scenarios in `project-stages.feature` (planner).
- 2026-11-16 – Readiness check against task 120 as merged (PR #124): dependencies and reused steps named after the real code; the bar and the button use `useActionState` so their messages show; `STAGE_PHASES` shared with task 123. READY (planner).

## Parking lot
- Dragging a project between stages (bar or board).
- Warning on the bar too, if the owner finds jobs skipped by mistake.
- The stage bar on the customer page's project list.
