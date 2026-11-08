---
name: dod
description: Run the Definition of Done from docs/WORKFLOW.md for a task or lane and report each item as pass/fail with evidence. Use before opening a PR or when the user asks "is it done?".
---

# Definition of Done for task `<id>` (lane `<n>`, or the current checkout)

Run the commands with `scripts/lane.sh exec <n> -- …` when a lane is given. Report each item as ✓ or ✗ with its evidence: a count, a command, or a `file:line`.

1. **Acceptance:**
   - `E2E_TAGS="@task:<id>" pnpm test:e2e` passes;
   - then the full `pnpm test:e2e` passes;
   - no scenario of the task still has `@wip`: `grep -n "@wip" docs/features/*.feature | grep "@task:<id>"` is empty.
2. **Unit tests:** `pnpm test` passes, and the diff adds `*.test.ts(x)` files next to its new logic: `git diff --stat origin/main...HEAD`.
3. **Lint and types:** `pnpm lint` and `pnpm typecheck` are clean.
4. **Storybook:** every new or changed component in the diff has a `*.stories.tsx`, and `pnpm build-storybook` succeeds.
5. **Boundaries:**
   - no import from one `apps/<zone>` into another: `git diff origin/main...HEAD -- apps | grep "^+.*from \"\.\./\.\./"` and imports of `@repo/<zone app>` return nothing;
   - no `drizzle-orm` imports in `apps/`.
6. **Docs:** `ARCHITECTURE.md`, the ADRs and the feature file are updated where the diff adds modules, tables or decisions. The task's Progress log is current.
7. **TODOs:** `git diff origin/main...HEAD | grep "^+.*TODO"`: every hit names a task.
8. **Security:** every Critical, High or Medium finding of the `access-auditor` and `security-reviewer` is fixed; Low and Info ones are in `docs/security/register.md`; a gap the task fixes is marked there.
9. **PR:** it links the task and feature file (checked once the PR exists).

End with **DONE** or **NOT DONE: <items>**.
