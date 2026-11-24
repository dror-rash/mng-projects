# Task 125: Upgrade TypeScript to 6

- **Status:** in-progress
- **Milestone:** none (chore, outside M15's order; owner 2026-11-24: "take care of the upgrades")
- **Zone / package:** every `package.json` that lists `typescript` (root, `packages/*`, `apps/*`, `e2e`), `pnpm-lock.yaml`, and the tsconfig or type declarations the new errors need
- **Feature file:** none (no behavior change; the existing suites are the acceptance test)
- **Depends on:** nothing. Replaces Dependabot PR #122 (`typescript` 5.9.3 → 6.0.3), whose CI `verify` fails. Independent of task 126 (Storybook 10); if both are open at once, the second to merge rebases on the first and reruns `pnpm build-storybook`.

## Why
Dependabot's TypeScript 6 bump fails CI, so the repo stays on 5.9 and the PR stays open. Moving to 6 by hand keeps the toolchain current and clears the queue.

## Scope
- Bump `typescript` to `^6.0` in every `package.json` that lists it: root, `packages/ui`, `packages/storage`, `packages/auth`, `packages/testing`, `packages/db`, `packages/i18n`, `e2e`, `apps/shell`, `apps/dashboard`, `apps/example-zone`. One version across the repo; regenerate `pnpm-lock.yaml`.
- Fix the new errors with the smallest correct change. The known one, from #122's CI run:
  `apps/example-zone/app/layout.tsx(4,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.`
  TS 6 checks side-effect imports by default; every zone that imports a global stylesheet (shell, dashboard, example-zone) likely has it. The implementer picks the fix (for example a `*.css` module declaration, shared or per zone, or a tsconfig option) and justifies it in the PR and the progress log. Any other new TS 6 error is fixed the same way: smallest change, no `// @ts-ignore` / `@ts-expect-error` to silence it.
- Check that the tooling that reads TypeScript supports 6: `typescript-eslint` (`packages/config`), Next.js's type check in `next build`, Vitest, Playwright / `bddgen`, Storybook's `react-vite` framework, `drizzle-kit`. Bump one only if it refuses or breaks on TS 6, and say which and why in the PR.
- Keep green: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm build-storybook`.
- After merge: close Dependabot PR #122 with a link to this task's PR.

## Out of scope
- Adopting new TS 6 features or stricter compiler options beyond what the upgrade forces.
- Any other dependency bump not required for TS 6 (other Dependabot PRs, Storybook 10: task 126).
- Refactoring code the new errors don't touch.

## Acceptance criteria
- [ ] Every `package.json` that lists `typescript` asks for `^6.0`, and the lockfile resolves one 6.x version.
- [ ] `pnpm typecheck` passes in every package with no new `@ts-ignore` / `@ts-expect-error`.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test` and `pnpm build-storybook` pass.
- [ ] The full `pnpm test:e2e` suite passes unchanged (no scenario edited) — the acceptance test for "no behavior change".
- [ ] CI `verify` and `e2e` are green on the PR; #122 is closed after merge.

## Security notes
No data, roles or runtime behavior change. The diff touches `package.json` and `pnpm-lock.yaml` (and possibly tsconfig), which are security-sensitive paths in `docs/SECURITY.md`: the `security-reviewer` runs. TypeScript is a dev dependency; the reviewer checks that the lockfile adds no unexpected packages, that any tooling bump is the one named, and that `pnpm audit --prod --audit-level=high` (CI's `security` job) stays clean. No register gap fixed.

## Approach (brief)
Bump, `pnpm install`, run `pnpm typecheck` to list the errors, fix each with the smallest change (expected: one CSS side-effect import declaration), then the full Definition of Done. No ADR expected; if the fix changes a shared tsconfig convention, note it in `docs/ARCHITECTURE.md`.

## Test plan
- Acceptance: the existing suite, unchanged (`pnpm test:e2e`, full run; per the M22 note, a production build with `CI=true` is the steadier local run).
- Unit/component: the existing Vitest suites; no new tests (no new logic).
- Storybook: `pnpm build-storybook` builds every existing story.

## Definition of Done (items that apply)
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Existing acceptance and unit suites pass locally and in CI
- [ ] Storybook builds; a11y addon shows no new violations
- [ ] No cross-zone imports; boundaries respected (a shared CSS declaration lives in a package or per zone, not imported across zones)
- [ ] Docs updated where relevant (`ARCHITECTURE.md` only if a tsconfig convention changes)
- [ ] Security review done (dependency change); findings fixed or recorded in `docs/security/register.md`
- [ ] No TODOs left without a linked task
- [ ] PR links this task and closes/supersedes #122

## Progress log

- 2026-11-24: started in lane 1.
- 2026-11-24: bumped `typescript` to `^6.0.0` in all 11 `package.json` files; the lockfile resolves 6.0.3 only (no 5.x left, no new packages; peers of `typescript-eslint` 8.73, `@storybook/react-vite` 9.1 and `react-docgen-typescript` now resolve against 6.0.3). Red: `pnpm typecheck --continue` failed in shell, dashboard and example-zone with TS2882 on `import "./globals.css"` (TS 6 turns on `noUncheckedSideEffectImports`; Next 15.5's types declare only `*.module.css`). No other new error.
- 2026-11-24: fix: a one-line `css.d.ts` (`declare module "*.css";`) per zone. Chosen over `noUncheckedSideEffectImports: false` in `tsconfig.nextjs.json` because it keeps TS 6's check for every other side-effect import (a mistyped package or path still fails) and only answers for stylesheets, which Next's bundler resolves; `*.module.css` keeps Next's more specific typed declaration. Per zone, not shared, because the zone tsconfigs set their own `include` and each zone owns its stylesheet (no cross-zone imports). No tooling bump needed: `typescript-eslint` 8.73, Next 15.5 build type check, Vitest, Playwright/`bddgen`, Storybook 9 `react-vite` and `drizzle-kit check` all work on 6.0.3. Green: `pnpm lint`, `pnpm typecheck`, `pnpm test` (900 unit tests), `pnpm build`, `pnpm --filter @repo/ui build-storybook`; e2e on a production build (`CI=true`): `@smoke` 3/3 and zone-navigation, workspaces, project-tasks, form-validation 28/28. Full `pnpm test:e2e` left to QA.
- 2026-11-24 – Drafted by the planner from the owner's "take care of the upgrades" and #122's CI failure.

## Parking lot
- Adopting TS 6 options or features (stricter checks, new defaults made explicit) as a separate task.
- A Dependabot group or ignore rule so major TypeScript bumps arrive as a task instead of a failing PR.
