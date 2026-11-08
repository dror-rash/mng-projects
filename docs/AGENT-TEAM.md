# The agent team

How tasks get done here since task 067 (ADR-0010). The main Claude Code session is the **orchestrator**: it dispatches agents, checks their claims, and talks to the owner. It doesn't write task code.

## Who does what

| Agent | Job | Edits | Must not |
|---|---|---|---|
| `planner` | Task files, `@wip` feature files, `PLAN.md`, parking lots; READY / NOT READY checks | `docs/` | write code; invent scope (open questions go to the owner) |
| `spec-writer` | Removes `@wip`, writes step definitions, shows the red run failing for the right reason | `e2e/`, `docs/features` (`@wip` tags only) | write production code; reword scenarios |
| `implementer` | TDD to green inside the task's lane, plus migrations, stories and docs | `apps/`, `packages/`, `docs/` | edit feature files or applied migrations; expand scope |
| `access-auditor` | Read-only hunt for access leaks: roles, `withAccess`, RLS, access functions, client payloads | none | fix code (it reports, with CONFIRMED / PLAUSIBLE) |
| `security-reviewer` | Read-only review of auth, web surface, files, infra and workflows, dependencies, secrets and agent tooling (`docs/SECURITY.md`); also an area reviewer in the full review | none | fix code (it reports severity with CONFIRMED / PLAUSIBLE) |
| `reviewer` | Read-only review against `CLAUDE.md`, the task's scope and the TDD order | none | fix code (it reports blocker / should-fix / nit) |
| `infra` | `infra/` Terraform, workflows, deploy checks; `terraform plan` output in the PR | `infra/`, `.github/`, `Dockerfile` | apply, deploy by hand, read secrets, touch app code |
| `qa` | Full suites, build, Storybook, screenshots, DoD; triages failures | none | call a failure a pass; retry until green |

The definitions live in `.claude/agents/`.

## The pipeline for one task
```
planner (READY?) → task-start (lane) → spec-writer (red) → implementer (green)
   → access-auditor ∥ security-reviewer ∥ reviewer → implementer (fixes) → qa → dod → PR → merge → lane-merge
```

Run it with the `run-task <id>` skill. The skills are in `.claude/skills/`:
- `task-start`: readiness check, lane, status;
- `dod`: the Definition of Done with evidence;
- `lane-merge`: merge and clean up;
- `security-review`: the full security review (monthly, per milestone, before go-live), which updates the [gap register](security/register.md). The process is in [`SECURITY.md`](SECURITY.md).

## Lanes
Each task runs in its own worktree next to the repo (`../mng-projects-lanes/lane-<n>`), with its own database and ports:

| Lane | Shell | Example zone | Dashboard | Database |
|---|---|---|---|---|
| none (main checkout) | 3000 | 3001 | 3002 | from `.env` |
| n (1–9) | 3000+10n | 3001+10n | 3002+10n | `app_lane<n>` |

```bash
pnpm db:up
scripts/lane.sh up 1 feat/workers            # worktree, .env, database, migrate, install
scripts/lane.sh exec 1 -- pnpm test:e2e      # any command, in the lane with its env
scripts/lane.sh list
scripts/lane.sh down 1                       # removes worktree + database, keeps the branch
```

The zones' `dev`/`start` scripts and the Playwright config read `SHELL_PORT`, `EXAMPLE_PORT` and `DASHBOARD_PORT`, which default to the usual ports. Run at most three e2e suites at once on this machine, counting other sessions: dev servers are memory-heavy, and two full suites in parallel already cause random timeouts (task 066). **Never work in the main checkout** while another session may use it: every task, the orchestrator's own included, goes in a lane.

## Guard rails (hooks)
`.claude/hooks/guard.sh` runs before every edit and shell command (`.claude/settings.json`). It refuses:
- edits to applied migrations (any file in `packages/db/migrations/` already in `origin/main`, except `meta/_journal.json`);
- edits to `.env*` (except `.env.example`), `*.tfvars`, `backend.hcl` and Terraform state;
- a `drizzle-orm` import under `apps/`;
- `terraform apply/destroy`;
- Cloud Run changes by hand on any release track (`gcloud [alpha|beta] run deploy`, `run services replace|update|update-traffic|delete`), and reading a Secret Manager value (`gcloud secrets versions access`);
- force pushes in every spelling (`-f` alone or combined like `-uf`, `--force`, `--force-with-lease`, `--force-if-includes`, a `+refspec`) and destructive pushes (`--mirror`, deleting `main`/`master` with `:main` or `--delete`/`-d`, a `remote.*.push=+…` or `remote.*.mirror` from `git -c`); deleting a feature branch is fine;
- `git add -f` / `--force` (ignored files stay out; ask the owner);
- `git commit --no-verify` / `-n`, also inside a short-option cluster (`-nm`, `-anm`); text in a quoted message doesn't count;
- `git config remote.<x>.push` / `remote.<x>.mirror`, and a push with `--prune`, `GIT_CONFIG_*` or `--config-env`;
- a command with more than one `git commit`, or a commit in a command that also runs `bash`/`sh -c`, a heredoc or pipe into a shell, `eval` or `env -C`.

Git accepts unambiguous prefixes of long options, so `--for…`, `--mi…`, `--d…`, `--pru…` and `--no-ve…` count as `--force…`, `--mirror`, `--delete`, `--prune` and `--no-verify`. The commit checks read the command without heredoc bodies and with quoted text blanked (needs `perl`), so a message can mention `git commit`, `cd` or `bash -c`.
- a `feat:` / `fix:` / `refactor:` commit that changes a `.feature` file;
- a commit that changes an applied migration;
- any commit when `pnpm lint` or `pnpm typecheck` fails.

Commits behind git global options (`git -c k=v commit`, `git --no-pager commit`, `git -C <dir> commit`) get the same checks. They run in the repository the commit is made in, resolved from the command in this order: the session cwd, a leading `cd <dir> &&` (or `;`), `scripts/lane.sh exec <n> --` (the lane's worktree), then `git -C <dir>`. `-C "$(scripts/lane.sh path <n>)"` resolves to the lane too. So a commit in a lane worktree is checked there, not in the main checkout (task 084). The commit is **refused when the directory can't be resolved**: a `cd`/`-C` target that is dynamic (`$…`, backticks, `\`, `~user`), `-`, or doesn't exist; a lane without a worktree; or a `cd`, `pushd`, `GIT_DIR=`, `--git-dir`, `--work-tree` or `lane.sh exec` the resolver didn't consume (a subshell `(cd x && git commit)`, a `cd` that isn't leading, `cd x || exit; git commit`). Use a literal path or `scripts/lane.sh exec <n> -- git commit`. Backslash-newline continuations are joined before matching.

The guard is a seatbelt, not a boundary: it pattern-matches the command, so it catches honest mistakes and obvious shortcuts, not a determined bypass (`bash -c`, `eval`, variables, a script file). The real limits are the owner's credentials and settings (SEC-13) and branch protection (SEC-02).

Tests: `bash scripts/test-hooks.sh` (also in CI's `verify` job) and `bash scripts/test-lane.sh` (the second needs the local Postgres).

## Working with the owner
Only the owner answers product questions. Agents put them in the task's "Open questions", and the orchestrator asks the owner. The owner also does the one-time GCP steps (`infra/README.md`) and anything the guard refuses.
