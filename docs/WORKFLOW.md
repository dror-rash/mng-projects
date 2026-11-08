# Workflow: ticket to merged

## The loop
1. **Plan** – confirm the item exists in `PLAN.md`. Create a task from `templates/task.md` in `docs/tasks/`.
2. **Specify** – write or update the Gherkin in `docs/features/<feature>.feature`. Get it reviewed before coding. Scenarios written ahead of their task are tagged `@wip` so the suite skips them; remove the tag when the task starts (step 3).
3. **Red (acceptance)** – generate step definitions, run `pnpm test:e2e`, confirm the new scenario fails for the *right reason*.
4. **Red (unit)** – pick the smallest next behavior, write a failing Vitest/Testing Library test.
5. **Green** – write the minimum code to pass. Nothing more.
6. **Refactor** – clean up with tests green. Extract to `packages/*` only when a second consumer exists.
7. **Repeat 4–6** until the acceptance scenario passes.
8. **Storybook** – add/update stories for any new or changed UI.
9. **Verify** – run the Definition of Done below.
10. **Close** – update task status, tick the milestone in `PLAN.md`, add an ADR if a decision was made.

## Definition of Done
- [ ] Acceptance scenarios for the task pass locally and in CI
- [ ] Unit/component tests added for new logic
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Storybook stories added/updated; a11y addon shows no new violations
- [ ] No cross-zone imports; boundaries respected
- [ ] Docs updated (`ARCHITECTURE.md`, ADR, feature file) where relevant
- [ ] Security findings fixed, or recorded in `docs/security/register.md` (see `docs/SECURITY.md`); no open P0 gap is made worse
- [ ] No TODOs left without a linked task
- [ ] PR links task + feature file

## Troubleshooting
- Acceptance tests slow or timing out locally after a long session: dev servers grow in memory and Next restarts them mid-run ("approaching the used memory threshold" in the dev log). Stop and restart `pnpm dev`.
- Don't run `pnpm build` while `pnpm dev` is running; both write to each app's `.next` and the dev server breaks.

## Task states
`todo` → `in-progress` → `in-review` → `done` (or `blocked` with reason)

## Layers of testing
| Layer | Tool | Scope | Speed |
|---|---|---|---|
| Acceptance | Playwright + Gherkin | User-visible behavior, through the real app | slow |
| Component | Vitest + Testing Library | A component or hook in isolation | fast |
| Unit | Vitest | Pure logic | fastest |
| Visual/a11y | Storybook | Component states | fast |

Write most tests low, few high. Every acceptance scenario must map to a requirement in the task.
