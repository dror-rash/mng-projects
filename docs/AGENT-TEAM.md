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
- `terraform apply/destroy`, `gcloud run deploy`, force pushes, and `git commit --no-verify`;
- a `feat:` / `fix:` / `refactor:` commit that changes a `.feature` file;
- a commit that changes an applied migration;
- any commit when `pnpm lint` or `pnpm typecheck` fails.

Tests: `bash scripts/test-hooks.sh` and `bash scripts/test-lane.sh` (the second needs the local Postgres).

## Working with the owner
Only the owner answers product questions. Agents put them in the task's "Open questions", and the orchestrator asks the owner. The owner also does the one-time GCP steps (`infra/README.md`) and anything the guard refuses.
