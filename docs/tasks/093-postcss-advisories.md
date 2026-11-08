# Task 093: postcss advisories in `next` (pnpm override)

- **Status:** in-progress
- **Milestone:** cross-cutting (security)
- **Zone / package:** root `package.json` (`pnpm.overrides`), `pnpm-lock.yaml`. No app code, no schema change, no migration. Commit type `fix(deps)` (or `build(deps)`).
- **Feature file:** none (no visible behavior; the existing unit, Storybook and e2e suites, and the preview's `@smoke` run, are the check)
- **Depends on:** nothing. Task 082's `security` job (`pnpm audit --prod --audit-level=high`) is green for postcss once this lands.

## Why
Task 082's new `pnpm audit --prod --audit-level=high` reports two High advisories in `postcss` 8.4.31, which `next` pins exactly (path `apps__dashboard>next>postcss`, and the same `next` in the other zones): GHSA-6g55-p6wh-862q (fixed in ≥ 8.5.12) and GHSA-r28c-9q8g-f849 (fixed in ≥ 8.5.18). `--prod` sees them because `next` is a production dependency, so they keep the `security` job red. Owner decision 2026-11-08: fix them with a `pnpm.overrides` entry in this task (the `tinypool` advisories are accepted separately in task 082). Register **SEC-42**.

## Scope
- Root `package.json`: a `pnpm.overrides` entry that resolves `next`'s `postcss` to `>= 8.5.18`, scoped to `next`'s dependency if pnpm resolves it that way cleanly (`"next>postcss": "^8.5.18"`); a global `"postcss"` override only if the scoped one doesn't take effect, with the reason in the PR. The tree already has `postcss` 8.5.x for Tailwind; ideally one `postcss` version remains.
- `pnpm-lock.yaml` regenerated with `pnpm install`; no other version changes beyond what the override pulls in (the PR lists the lockfile's changed packages).
- Proof in the PR description:
  - before: `pnpm audit --prod --audit-level=high` lists GHSA-6g55-p6wh-862q and GHSA-r28c-9q8g-f849 (red run pasted);
  - after: it no longer lists `postcss` (output pasted); `pnpm why postcss` shows no version below 8.5.18.
- Everything still passes: `pnpm lint && pnpm typecheck`, `pnpm build` (all three zones; CSS compiles the same), `pnpm build-storybook`, `pnpm test`, the full `pnpm test:e2e`.
- The PR's preview deploy succeeds and its `@smoke` and `@poc` run passes (`deploy.yml`).

## Out of scope
- The `tinypool` advisories (`better-auth>vitest>tinypool`): accepted in task 082.
- The `drizzle-orm` advisory: task 081 (SEC-16).
- Upgrading `next` itself, or any other dependency bump or override.
- Changes to the `security` job or its `ignoreGhsas` list (task 082).

## Acceptance criteria
- [x] `pnpm audit --prod --audit-level=high` no longer lists GHSA-6g55-p6wh-862q or GHSA-r28c-9q8g-f849 (before/after output in the PR).
- [x] `pnpm why postcss` shows no `postcss` below 8.5.18; the override is in root `package.json` and scoped to `next` unless the PR explains why not.
- [x] `pnpm lint && pnpm typecheck`, `pnpm build`, `pnpm build-storybook`, `pnpm test` and the full `pnpm test:e2e` pass.
- [ ] The PR's preview deploy succeeds and its `@smoke` / `@poc` run passes.

No new scenarios: no behavior changes. Each criterion maps to a command or CI check above.

## Security notes
A dependency change (`package.json`, `pnpm-lock.yaml`), so the `security-reviewer` runs: it checks that the override pulls only `postcss` (and its own dependencies) from the registry, with lockfile integrity hashes, and that no unrelated package moved. `postcss` runs at build time (CSS processing in `next build` and the dev server), not on request handling, so the reachable risk today is low; the change removes a High finding that blocks the audit gate. No data, roles or access code touched. Fixes register gap **SEC-42**.

**Before the POC (2026-11-13):** safe to merge before the POC if the PR's preview deploy and its `@smoke` / `@poc` run pass; otherwise hold it until after.

## Approach (brief)
Red: run `pnpm audit --prod --audit-level=high` and paste the two postcss lines. Add the scoped override, `pnpm install`, check `pnpm why postcss`, rerun the audit, then every suite and the build; push and read the preview deploy. Read the postcss 8.5 changelog for breaking changes and note "affects us / doesn't" in the PR. No ADR (an override is easy to remove).

## Test plan
- Acceptance: the full existing suite locally; `@smoke` and `@poc` on the preview.
- Unit/component: existing suites; no new tests.
- Storybook: `pnpm build-storybook` builds (no story changes).

## Open questions
- None blocking.

## Progress log
- 2026-11-08 – Drafted from task 082's audit run; owner decision: fix postcss with a `pnpm.overrides` entry in a new task, tinypool accepted in task 082.
- 2026-11-08 – Started in lane 1.
- 2026-11-08 – Red (before): `pnpm audit --prod --audit-level=high` lists `postcss` twice, both at path `apps__dashboard>next>postcss`: high GHSA-6g55-p6wh-862q (vulnerable <=8.5.11, patched >=8.5.12) and high GHSA-r28c-9q8g-f849 (vulnerable <=8.5.17, patched >=8.5.18); 12 vulnerabilities (7 moderate, 3 high, 2 critical). `pnpm why postcss -r`: `next 15.5.28 └── postcss 8.4.31` (in every zone and under `better-auth`'s `next` peer); everything else (Tailwind, Vite) on `postcss 8.5.30`.
- 2026-11-08 – Added `"pnpm": { "overrides": { "next>postcss": "^8.5.18" } }` to root `package.json`; the scoped override took, no global one needed. `pnpm install`: the lockfile drops `postcss@8.4.31` and points `next`'s `postcss` at the existing `8.5.30` (no new package downloaded, nothing else moved). After: the audit lists no `postcss` (8 vulnerabilities: 5 moderate, 1 high `drizzle-orm` (task 081), 2 critical `tinypool` (task 082)); `pnpm why postcss -r` shows only `postcss 8.5.30`, including `next 15.5.28 └── postcss 8.5.30`.
- 2026-11-08 – Checks in lane 1, all green: `pnpm lint && pnpm typecheck`; `pnpm test` (568 unit/component tests: dashboard 439, auth 41, ui 51, db 22, e2e 10, storage 5); `pnpm build --force` (shell, example-zone, dashboard compile; CSS through Tailwind/postcss unchanged); `pnpm build-storybook`; full `CI=1 pnpm test:e2e --workers=2` 323 passed, none flaky. postcss 8.4 → 8.5 has no breaking API change that affects us (8.5 adds `Input#document`; `next` only uses postcss to process CSS at build/dev time). Left: the PR's preview deploy and `@smoke` / `@poc` run.

## Parking lot
- Drop the override once a `next` release depends on `postcss` ≥ 8.5.18 itself.
