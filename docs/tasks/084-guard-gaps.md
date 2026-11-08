# Task 084: Guard hook gaps and commit checks in lane worktrees

- **Status:** in-progress
- **Milestone:** cross-cutting (security, agent team)
- **Zone / package:** `.claude/hooks/guard.sh`, `scripts/test-hooks.sh`, `.github/workflows/ci.yml` (one step), `docs/AGENT-TEAM.md` (guard section), `docs/SECURITY.md` (CI checks table). Commit type `fix(tooling)` / `test(tooling)`.
- **Feature file:** none (tooling; `scripts/test-hooks.sh` is the test)
- **Depends on:** task 067 (guard: done), task 073 (symlinks: done). Folds in the parked item from task 061 ("Commit guard in lanes").

## Why
The PreToolUse guard (ADR-0010) is the seatbelt that keeps agents from deploying by hand, force-pushing, reading production secrets and committing without the project's checks. Several commands slip past its patterns, and a commit made in a lane worktree is checked against the main checkout, so lint, typecheck and the feature-file, applied-migration and `drizzle-orm` rules are skipped for lanes, where most work now happens. Register **SEC-12**; task 061's parking lot.

## Scope
- **Refused commands** (each with a reason that names the rule, like today's messages):
  - reading a Secret Manager value: `gcloud secrets versions access …` (any release track);
  - Cloud Run changes by hand on any release track: `gcloud [alpha|beta] run deploy`, `run services replace|update|update-traffic|delete`;
  - force pushes in every spelling: `+<refspec>`, combined short flags containing `f` (`-uf`, `-fu`), `--force`, `--force-with-lease`, `--force-if-includes`;
  - `git add -f` / `--force` (question 1);
  - commits with git global options before `commit`: `git -c k=v commit`, `git --no-pager commit`, `git -C <dir> commit`, and combinations, get the full commit checks (today `-C` alone is matched).
- **Which repo a commit is checked in:** the guard resolves the commit's repository from the command, in this order: `git -C <dir>`; a leading `cd <dir> &&` (or `;`); `scripts/lane.sh exec <n> -- …` (the lane's worktree path, as `lane.sh` computes it); else the session cwd (today's behavior). The index, the base ref for applied migrations, and `pnpm lint && pnpm typecheck` all run in that repository.
- **Tests:** `scripts/test-hooks.sh` gets a case for every new refusal, an allowed look-alike for each (e.g. `gcloud run services describe`, `git push origin main`, `git add .env.example`), and worktree cases: a temporary second worktree where a `feat:` commit that changes a `.feature` file, or edits an applied migration, is refused when committed through `cd <wt> && git commit`, `git -C <wt> commit` and a lane-style path.
- **CI:** `bash scripts/test-hooks.sh` runs in `ci.yml`'s `verify` job (`GUARD_SKIP_CHECKS=1`, as the script already does for lint).
- `docs/AGENT-TEAM.md` lists what the guard refuses and says it is a seatbelt, not a boundary (see Security notes); `docs/SECURITY.md` CI checks: the `test-hooks.sh` row becomes `in place`.

## Out of scope
- **Owner settings (SEC-13):** a project-level auto-mode context, `permissions.deny` rules in `.claude/settings.json`, a gcloud configuration without Owner rights for agent sessions.
- A real git `pre-commit` hook through `core.hooksPath` (question 2).
- Catching commands hidden behind `bash -c`, `eval`, variables or scripts (see Security notes).

## Acceptance criteria
- [x] Each command in the review's list (SEC-12 evidence) is refused, and `test-hooks.sh` has a case for it (red first: the new cases fail against today's guard).
- [x] Look-alike commands that are fine still pass (cases in `test-hooks.sh`).
- [x] A `feat:` commit changing a `.feature` file is refused in a second worktree via `cd <wt> && git commit`, `git -C <wt> commit` and `scripts/lane.sh exec <n> -- git commit` (the last as a resolved-path unit case; the test doesn't need a lane database).
- [x] `ci.yml` runs `bash scripts/test-hooks.sh` and it passes.
- [x] `docs/AGENT-TEAM.md` and `docs/SECURITY.md` updated.

## Security notes
Touches `.claude/` and `scripts/`, so the `security-reviewer` runs. No app data or roles. A pattern-matching guard can always be bypassed by a determined command (`bash -c`, `eval`, a script file); it catches honest mistakes and obvious shortcuts, and the real limits are the owner's credentials and settings (SEC-13) and branch protection (SEC-02). A too-wide pattern blocks legitimate agent work (the look-alike tests guard that). Fixes register gap **SEC-12** (agent-side; SEC-13 stays with the owner).

## Approach (brief)
Red: add the failing cases to `test-hooks.sh`. Then factor a `commit_repo()` resolver and widen the regexes. Keep the guard a single bash file with `jq`. No ADR (ADR-0010 already records the guard).

## Test plan
- Acceptance: none.
- Scripts: `scripts/test-hooks.sh` (new refusals, look-alikes, worktree cases); `bash scripts/test-lane.sh` stays green.
- Storybook: none.

## Open questions
1. **`git add -f`:** refuse it always, or only for ignored secret-looking paths (`.env*`, `*.tfvars`, key files)? Default: always (agents have no reason to add an ignored file; the message says to ask the owner).
2. **A real `pre-commit` hook** (`core.hooksPath`) so the checks also run for the owner's own commits and every tool? Default: not in this task (it changes the owner's workflow); parking lot.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-12) and task 061's parking lot; owner: "start fixing the P1 gaps".
- 2026-11-08 – Started in lane 3 (based on `docs/security-p1-tasks`, PR #59). Open questions take their defaults.
- 2026-11-08 – Red: 32 new cases in `scripts/test-hooks.sh` (46 passed, 32 failed against the old guard). Green: `commit_repo()` resolves the commit's repository (cwd, leading `cd`, `scripts/lane.sh exec <n>`, `git -C`), `git_sub`/`git_args` match git global options, widened gcloud/push/add patterns; 78 passed, 0 failed (also with `GUARD_BASE_REF=origin/main`). Real-repo cases count `HEAD` as applied so CI's shallow checkout works. `ci.yml` `verify` runs it. `bash scripts/test-lane.sh`: 14/15, the same as on the base commit ("migrates the lane's database": `Cannot find module 'drizzle-kit'` with `LANE_SKIP_INSTALL=1`; not touched here).

## Parking lot
- A real git `pre-commit` hook via `core.hooksPath` (question 2).
- A `.gitignore` widened for secret-looking files is SEC-31 (P2), not this task.
- `test-lane.sh` "migrates the lane's database" fails locally with `LANE_SKIP_INSTALL=1` (`drizzle-kit` not resolvable from the lane's `drizzle.config.ts`); pre-existing.
- Not refused on purpose: `git commit -m '… -n …'` still trips the `-n` check (old behavior); a `cd` that isn't leading (`pnpm x && cd <wt> && git commit`) falls back to the earlier directory; other `gcloud run` groups (`jobs`, `domain-mappings`) and `gcloud secrets versions add` are out of the task's list.
