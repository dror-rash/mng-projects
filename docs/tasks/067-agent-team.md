# Task 067: The agent team (harness)

- **Status:** done (PR #36)
- **Milestone:** POC (2026-11-13), first step
- **Zone / package:** `.claude/` (agents, hooks, skills, settings), `scripts/`, `apps/*/package.json` (ports), `e2e/playwright.config.ts` (ports), `docs/`
- **Feature file:** none (developer tooling, no user-visible behavior). Tested by `scripts/test-hooks.sh` and `scripts/test-lane.sh`.
- **Depends on:** ADR-0010

## Why
The POC needs about nine tasks in eight days. Today one session does everything, and the rules in `CLAUDE.md` are only kept because the agent remembers them. A team of agents with one job each, run in parallel lanes, with hooks that enforce the rules, gets more done and lets fewer rule breaks through.

## Scope
- **Agents** (`.claude/agents/*.md`, each with its own tools):
  - `planner`: plan, task files, `@wip` feature files, parking lots. No code.
  - `spec-writer`: Gherkin and step definitions, and the red run.
  - `implementer`: unit test first, then code until green, then refactor, within one task in its own lane.
  - `access-auditor`: read-only review for access leaks, RLS and `withAccess`; extends the leak suite.
  - `reviewer`: read-only review against `CLAUDE.md`.
  - `infra`: Terraform and workflows only, with `terraform plan` output in the PR. Never `apply` on production.
  - `qa`: full e2e run, screenshots, validation report, flaky-test triage.
- **Hooks** (`.claude/hooks/guard.sh`, `PreToolUse`), each refusal with a reason the agent can act on:
  - Edits to applied migrations (`packages/db/drizzle/*.sql` and `meta/` already in `main`), `.env`, `*.tfvars`, `backend.hcl` and `*.tfstate`.
  - An `import` from `drizzle-orm` in `apps/`.
  - `terraform apply`, `gcloud run deploy` and `git push --force` from a session.
  - `git commit` when `pnpm lint` or `pnpm typecheck` fails (`.claude/hooks/precommit.sh`).
  - A `feat:` or `fix:` commit whose staged files include `docs/features/*.feature` (rule 2: feature changes go in their own commit).
- **Lanes** (`scripts/lane.sh <n>`): a worktree with its own branch, database (`app_lane<n>` in the local Postgres) and ports (`3000+10n`, `3001+10n`, `3002+10n`), and a `.env` written to match. The zone dev and start scripts and the Playwright config read the ports from the environment, with today's defaults.
- **Skills** (`.claude/skills/`):
  - `task-start <id>`: lane, branch, `@wip` off, task status.
  - `dod`: runs the Definition of Done and reports each check.
  - `lane-merge`: merges a finished lane into its target branch after the checks, then removes the worktree and database.
  - `run-task <id>`: the pipeline for one task (planner check → spec-writer → implementer → access-auditor and reviewer in parallel → qa).
- **Docs:** `docs/AGENT-TEAM.md` (who does what, the pipeline, how to run a lane); `CLAUDE.md` points to it; ADR-0010.

## Out of scope
- Running agents in CI or on a schedule (cloud agents).
- Agents for M13 product questions: they still go to the owner.
- Splitting the e2e suite so lanes don't load the machine; measure first (task 066).

## Acceptance criteria
- [x] `scripts/test-hooks.sh` shows each guard refusing what it should and letting normal edits and commits through.
- [x] `scripts/test-lane.sh` creates lane 1 and checks its worktree, `.env`, database and ports, then removes it.
- [x] `pnpm test:e2e` still passes on the default ports (no lane).
- [ ] Each agent file loads (`/agents` lists all seven; checked in a new session after merge) and states its job, its tools and what it must not do.
- [x] `docs/AGENT-TEAM.md` documents the pipeline and lanes; `CLAUDE.md` links it.

## Approach (brief)
Hooks are bash scripts that read the tool-call JSON with `jq`, so they need no build. Read-only agents get no `Edit`/`Write` tools. The implementer's prompt holds the TDD loop and the domain conventions it most often gets wrong. The main session is the orchestrator: it doesn't write task code itself once the team exists.

## Test plan
- Hook script tests feed recorded tool-call JSON to `guard.sh` and check the exit code and message.
- The lane script test runs against the local Postgres.
- e2e: the full suite on default ports after the port change.

## Progress log
- 2026-11-02 – Planned at the owner's request: agent team first, then the POC (tasks 068–069 and M13 056–061, 064).

- 2026-11-02 – Built:
- 2026-11-14 – Status synced: merged in PR #36 (2026-11-02).
  - **Tests:** guard 29/29, lane 15/15.
  - **Lane 1 dogfood:** the full e2e suite ran in lane 1 (ports 3010–3012, `app_lane1`).
    - The first run gave 228 passed and 19 failed, at the same time as another session's full suite in the main checkout (load average about 21).
    - The 19 failures (ECONNRESET, closed pages, timeouts) all passed when re-run alone (`--last-failed`), so it is load, as in task 066.
  - **Other checks:** unit tests 363, lint and typecheck clean.
  - **A lesson:** a second session switched the shared main checkout to another branch mid-task. From now on every task, including the orchestrator's own, works in a lane, never in the main checkout.

## Parking lot
- The "at most three lanes" limit should count every session's e2e runs, not only this team's: a shared lock file in `scripts/lane.sh` around `test:e2e`.
- A `security-reviewer` agent for auth flows beyond access (sessions, `safeNext`) if the access auditor misses them.
- Cost and token reporting per lane.
