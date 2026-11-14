# Task 115: The guard's lint/typecheck gate applies only to this project's commits

- **Status:** todo
- **Milestone:** unscheduled (agent tooling; owner request 2026-11-14)
- **Zone / package:** `.claude/hooks/guard.sh`, `scripts/test-hooks.sh`, `docs/AGENT-TEAM.md`
- **Feature file:** none (tooling; the acceptance tests are cases in `scripts/test-hooks.sh`)
- **Depends on:** nothing open. Builds on tasks 067 (guard, done PR #36), 084 (commit repository resolution, SEC-12, done PR #61) and 112 (done PR #103).

## Why
The guard runs `pnpm lint && pnpm typecheck` in the commit's repository before every agent `git commit`. When a session commits in another repository, for example a clone of the owner's notes repo `dror-rash/second-brain-v2` in the scratchpad (plain Markdown, no `package.json`), the guard refuses with `Command "lint" not found`, so the owner has to commit by hand. The gate exists to keep this project's code green; it has nothing to check elsewhere.

## Scope
- **"This project"** is decided from what git itself resolves for the commit's directory, never from a name or path the command supplies. A commit's repository (`root`, as resolved today by `commit_repo`) is this project when either:
  1. **Same common dir:** `git -C "$root" rev-parse --path-format=absolute --git-common-dir`, canonicalized with `pwd -P`, equals the same value for the guard's own repository. The guard's own repository is the one containing the running script: the directory of `${BASH_SOURCE[0]}` resolved with `cd … && pwd -P` (in a session that is `$CLAUDE_PROJECT_DIR/.claude/hooks/guard.sh`, set by Claude Code from `.claude/settings.json`, not by the agent's command). The main checkout and every lane worktree share that common dir. A directory whose `.git` file or `commondir` points into this project's git dir also resolves to it, and counts as this project.
  2. **Same remote:** any URL of any remote of the commit's repository (`git remote` then `git remote get-url --all <r>` and `git remote get-url --push --all <r>`, which apply `url.*.insteadOf`) matches any such URL of the guard's own repository, after normalizing: lowercase; strip a scheme (`https://`, `ssh://`, `git://`), a `user@` part, a trailing `/` and a trailing `.git`; turn the scp form `host:owner/repo` into `host/owner/repo`. So `git@github.com:dror-rash/mng-projects.git` and `https://github.com/dror-rash/mng-projects` match. A separate clone of this project (or a crafted repo that sets this origin) gets the gate. The URLs come from the guard repository's config, not a hard-coded `dror-rash/mng-projects`, so a fork works the same.
- **Commits in this project** keep every check, including `pnpm lint && pnpm typecheck` in `root` (unchanged).
- **Commits in another repository** skip only the `pnpm lint && pnpm typecheck` step, silently (no message, exit 0 if nothing else refuses). Every other refusal still applies to them as today: `--no-verify` / `-n`, more than one commit per command, a commit behind a shell / `eval` / `env -C`, an unresolvable directory, git aliases on the command line, heredoc lines, and the feature-file, applied-migration and `drizzle-orm` commit checks (they look at paths that don't exist in other repositories, so they stay as they are). Force pushes, `git add -f`, secret reads, Terraform, Cloud Run, `setup.sh infra` and file-edit refusals are not commit checks and don't change.
- **Fail closed:**
  - the commit's directory can't be resolved: refused as today (`unresolved`), unchanged;
  - the guard can't work out its own repository (script not in a git repository, `rev-parse` fails) or the commit repository's common dir: treat the commit as this project, so the gate runs (in a directory without `package.json` that means a refusal);
  - remote URLs that can't be read count as "no match"; the common-dir rule alone decides.
- **Repository overrides:** also refuse, as `unresolved`, a `GIT_COMMON_DIR=` assignment before the commit (today only `GIT_DIR=` and `GIT_WORK_TREE=` are refused). Without it, `cd /other && GIT_COMMON_DIR=<this project's .git> git commit` would let the guard see "another repository" while the commit's refs land in this project.
- **Tests** in `scripts/test-hooks.sh` that see whether lint ran: a fake `pnpm` first on `PATH` (a temp bin dir; it appends its arguments to a marker file and exits with a code the case chooses), with `GUARD_SKIP_CHECKS` unset for these cases only. Cases that need "the guard's own repository" copy `guard.sh` into the throwaway fixture repo (`$REPO/.claude/hooks/guard.sh`, committed there) and run that copy, so they don't depend on the checkout or CI clone running the tests.
- **Docs:** `docs/AGENT-TEAM.md`, "Guard rails (hooks)": the lint/typecheck line says it applies to commits in this project (the main checkout, a lane worktree, or a repository with one of its remotes), and that commits in other repositories get every other check. The header comment in `guard.sh` says the same.

## Out of scope
- Any other change to how the commit's repository is resolved (`commit_repo`, `resolve_dir`, `lane_dir`), beyond refusing `GIT_COMMON_DIR=`.
- Running some other repository's own checks (a notes repo's linter, its hooks).
- A per-repository allowlist or an env var to switch the gate off; `GUARD_SKIP_CHECKS` stays tests-only.
- Commits made without `git commit` (`commit-tree`, `merge`, `rebase`, `cherry-pick`, `am`): the guard never gated them (seatbelt, not a boundary; `docs/AGENT-TEAM.md`).
- Pushes: unchanged.

## Acceptance criteria
Each is a case in `scripts/test-hooks.sh` (fake `pnpm` records whether lint/typecheck ran):
- [ ] A commit in another repository without `package.json` (throwaway repo, no remote) is allowed and the fake `pnpm` is not called; also via `cd /abs/other && git commit` and `git -C /abs/other commit` from a session whose cwd is this project.
- [ ] A commit in the guard's own repository runs lint and typecheck: allowed when the fake `pnpm` passes, refused (exit 2, "pnpm lint && pnpm typecheck must pass") when it fails.
- [ ] A commit in a lane worktree of the guard's repository (`cd <lane> && git commit`, `scripts/lane.sh exec <n> -- git commit`, and `git -C "$(scripts/lane.sh path <n>)" commit`) runs lint and typecheck.
- [ ] A crafted repository that pretends to be this project still gets the gate: (a) a separate repo whose remote `origin` is set to the guard repository's origin URL (in a different spelling, ssh vs https, with/without `.git`); (b) a repo with a different remote name (`upstream`) carrying that URL; (c) a repo whose `.git` is a gitfile pointing at the guard repository's git dir. In each the fake `pnpm` is called; with a failing fake `pnpm` the commit is refused.
- [ ] A repository merely named like this project (directory `mng-projects`, no remote of this project) is treated as another repository (no gate). This shows the decision doesn't come from a name.
- [ ] `git commit --no-verify` and `-nm` in another repository are still refused; so are two commits in one command, a commit behind `bash -c`, and an unresolvable `cd "$X" && git commit` there.
- [ ] `cd /abs/other && GIT_COMMON_DIR=<guard repo's .git> git commit -m 'docs: x'` is refused (can't tell which repository).
- [ ] When the guard copy sits outside any git repository, a commit in another repository runs the gate (fail closed).
- [ ] All existing cases in `scripts/test-hooks.sh` still pass; `bash scripts/test-hooks.sh` passes in CI's `verify` job.

## Security notes
- Touches `.claude/` and `scripts/` (security-sensitive paths in `docs/SECURITY.md`): the **`security-reviewer` runs**. No app data, roles or migrations; no `access-auditor`.
- The change loosens a refusal, so the review should check the "this project looks like another repository" direction above all: any way a command can make the guard resolve a different repository from the one git commits into (env overrides such as `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`; `--git-dir`/`--work-tree`; `-c core.worktree`; symlinks; `/tmp` vs `/private/tmp`), and that each such case either keeps the gate or is refused. The decision must use git's own resolution (`rev-parse`) on the resolved directory, not a string compare of paths or names.
- Residual, accepted by design: an agent can now make a commit without lint in a non-project repository and push it to this project's GitHub by URL. Branch protection (SEC-02: `verify` required on PRs to `main`) still runs lint and typecheck before anything merges, and the guard was never a boundary (`docs/AGENT-TEAM.md`). If the reviewer rates it higher, it goes in the register as a new id rather than growing this task.
- SEC-12's row stays `fixed`; update it only if the review finds a regression.

## Approach (brief)
1. `test:` commit: fake `pnpm`, fixture with a guard copy in `$REPO`, the cases above (red: commits in another repository are refused today).
2. `feat:` commit in `guard.sh`: `guard_repo_common` (from `BASH_SOURCE`), `common_of <dir>`, `remote_urls <dir>` + `normalize_url`, `is_this_project "$root"`; wrap the lint/typecheck block in `if is_this_project "$root"`; add `GIT_COMMON_DIR` to the `unresolved` prefix pattern.
3. `docs:` commit: `docs/AGENT-TEAM.md` guard section, task status, `docs/PLAN.md` change-log line.
No ADR (ADR-0010 covers the guard; this is a narrowing of one check).

## Test plan
- Acceptance: the `scripts/test-hooks.sh` cases listed under "Acceptance criteria" (no feature file).
- Unit/component: none beyond the hook tests; `normalize_url` is covered through the ssh/https/`.git` crafted-repo cases.
- Storybook: none.
- By hand after merge: in a session, commit in a scratchpad clone of a Markdown-only repo; the guard lets it through.

## Open questions
None blocking. Defaults taken (the orchestrator asked for defaults; the owner can overrule):
1. **Identification:** common dir **or** a matching remote URL counts as this project (the union fails safe: more commits get the gate, never fewer). Default: yes, both.
2. **Remote URLs** come from the guard repository's own remotes, not a hard-coded `dror-rash/mng-projects`. Default: from config.
3. **Skipped gate is silent** (no stderr note). Default: silent.
4. **Guard's own repository unknown:** run the gate (fail closed). Default: yes.
5. **`GIT_COMMON_DIR=`** is refused as an unresolvable repository. Default: yes, in this task (it is the one override that would otherwise fool the new check).

## Progress log
- 2026-11-14 – Drafted from the owner's request ("make the guard change as a task").

## Parking lot
- Refuse a push by URL to this project's remote from a repository that isn't this project.
- Gate `git merge` / `rebase` / `cherry-pick` / `am` commits in this project too.
- A per-repository check hook (run a repository's own linter when it has one).
