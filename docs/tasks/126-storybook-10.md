# Task 126: Upgrade Storybook to 10

- **Status:** todo
- **Milestone:** none (chore, outside M15's order; owner 2026-11-24: "take care of the upgrades")
- **Zone / package:** `packages/ui` (`package.json`, `.storybook/`), `apps/dashboard` (`package.json`; its stories are built by `packages/ui`'s Storybook), `pnpm-lock.yaml`
- **Feature file:** none (no behavior change; the existing suites and stories are the acceptance test)
- **Depends on:** nothing. Replaces Dependabot PRs #121 (`@storybook/addon-a11y` 9 → 10.6.7) and #123 (`@storybook/addon-docs` 9 → 10.6.7), whose CI `verify` fails. Independent of task 125 (TypeScript 6); if both are open at once, the second to merge rebases on the first and reruns `pnpm build-storybook` and `pnpm typecheck`.

## Why
Dependabot bumps the Storybook addons one at a time, and an addon at 10 doesn't run on Storybook 9, so both PRs fail CI. Moving the whole Storybook set to 10 together keeps the UI workbench current and clears the queue.

## Scope
- Move every Storybook package to the same 10.x version together:
  - `packages/ui`: `storybook`, `@storybook/react-vite`, `@storybook/addon-docs`, `@storybook/addon-a11y`;
  - `apps/dashboard`: `storybook`, `@storybook/react-vite` (used to type its `*.stories.tsx`).
  Regenerate `pnpm-lock.yaml`.
- The failure to fix, from #121/#123's CI run: `storybook build` in `@repo/ui` fails because `@storybook/addon-docs` 10 imports `storybook/open-service`, which Storybook 9 doesn't have. Bumping the set together is expected to fix it.
- Follow the Storybook 9 → 10 migration notes as they apply here: the ESM-only config (`packages/ui/.storybook/main.ts` and `preview.ts`; today `main.ts` already uses `import.meta.url`), the Node version it needs against `.nvmrc` (22) and the root `engines` (`>=22`), and any renamed or removed config or addon options. The implementer lists the notes that applied in the progress log. `npx storybook@10 upgrade` / automigrations may be used; their changes are reviewed, not taken blindly.
- Keep every existing story rendering: `pnpm build-storybook` green, including the dashboard stories pulled in from `apps/dashboard/features/**`, and the a11y addon showing no new violations. CI runs `pnpm build-storybook` in `verify`; no Storybook test runner runs in CI today.
- Keep green: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:e2e`.
- After merge: close Dependabot PRs #121 and #123 with a link to this task's PR.

## Out of scope
- New stories, new addons, or a Storybook test runner / a11y checks in CI.
- Moving the dashboard's stories into a Storybook of its own.
- Any other dependency bump (TypeScript 6: task 125).

## Acceptance criteria
- [ ] Every Storybook package in `packages/ui` and `apps/dashboard` asks for the same 10.x version, and the lockfile resolves one version of each.
- [ ] `pnpm build-storybook` passes and every existing story (ui primitives and dashboard features) is in the build.
- [ ] `pnpm storybook` starts, and a spot check of stories shows them rendering with the a11y and docs panels working and no new a11y violations.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass; the full `pnpm test:e2e` suite passes unchanged.
- [ ] CI `verify` and `e2e` are green on the PR; #121 and #123 are closed after merge.

## Security notes
No data, roles or runtime behavior change; Storybook is a dev-only tool and is not deployed. The diff touches `package.json` and `pnpm-lock.yaml`, security-sensitive paths in `docs/SECURITY.md`: the `security-reviewer` runs. It checks that the lockfile adds no unexpected packages (Storybook 10 changes its dependency tree), that no new package reaches the zones' runtime dependencies, and that `pnpm audit --prod --audit-level=high` stays clean. No register gap fixed.

## Approach (brief)
Bump the set, `pnpm install`, apply the migration notes that touch `.storybook/main.ts` / `preview.ts`, run `pnpm build-storybook` and `pnpm storybook`, then the full Definition of Done. No ADR expected.

## Test plan
- Acceptance: the existing suite, unchanged (`pnpm test:e2e`; Storybook isn't part of the app, so this only confirms nothing else moved).
- Unit/component: the existing Vitest suites; no new tests.
- Storybook: every existing story builds and renders; a11y addon shows no new violations.

## Definition of Done (items that apply)
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Existing acceptance and unit suites pass locally and in CI
- [ ] Storybook builds and stories render; a11y addon shows no new violations
- [ ] Docs updated where relevant (CLAUDE.md / `ARCHITECTURE.md` only if a Storybook command or the Node requirement changes)
- [ ] Security review done (dependency change); findings fixed or recorded in `docs/security/register.md`
- [ ] No TODOs left without a linked task
- [ ] PR links this task and closes/supersedes #121 and #123

## Progress log
- 2026-11-24 – Drafted by the planner from the owner's "take care of the upgrades" and #121/#123's CI failure.

## Parking lot
- A Dependabot group for all `storybook` / `@storybook/*` packages so they arrive as one PR instead of one failing PR per addon.
- Running the a11y checks in CI (Storybook test runner) as a separate task.
