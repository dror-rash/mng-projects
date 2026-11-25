# Task 127: Move the agent team onto the agent-team-setup skill (2.3)

- **Status:** todo
- **Milestone:** none (developer tooling, alongside M15)
- **Zone / package:** `.claude/` (agents, hooks, skills, settings), `scripts/` (guard tests, lanes), `docs/AGENT-TEAM.md`, `docs/WORKFLOW.md`
- **Feature file:** none (developer tooling, no user-visible behavior). Tested by the guard and lane tests.
- **Depends on:** 067 (the team), `agent-team-setup` 2.3.0 (`~/Projects/skills`, tag `agent-team-setup/v2.3.0`)

## Why
This repo's team was built by hand (task 067) and has grown past the skill it came from, so it gets none of the skill's fixes and has no way to measure its agents. The skill now carries this repo's guard hardening, an install record for clean upgrades, and per-agent metrics. Data from this repo's 204 agent runs (2026-11-04 to 2026-11-25) shows where the time goes: the implementer is 56% of all re-read context (median 28 active minutes, 79 turns), driven by long runs that are continued instead of restarted (task 101: one implementer run of 145 active minutes and 220 turns; task 068: an infra agent resumed after 6.8 days, 234 turns). The skill's 2.3 `run-task` starts a fresh implementer after a long run, and its metrics hook shows whether that helps.

## Scope
- Install the skill in onboard/upgrade mode with this repo's commands (from `CLAUDE.md`) and the packs `drizzle`, `terraform-gcp`, `gherkin`, `storybook`, `postgres-lanes`, `security-review`.
- Models: profile `max`, with `qa` kept on Sonnet through `agent_frontmatter` (`{"qa": {"model": "sonnet"}}`), as today. Reviewers stay on the session's model: they are 3–5% of the cost each, and this repo's access rules are sensitive.
- Move this repo's own additions to the skill's extension points, not into managed files: guard rules to `.claude/hooks/guard.local.sh` with their tests in `scripts/test-guard.local.sh`; agent and skill notes to `.claude/agent-team/local/<name>.md`; the access-auditor and other repo-only agents and skills stay as they are; per-lane database and ports in `scripts/lane-hooks.sh`.
- The metrics hook (`SubagentStop`) and `scripts/agent-stats.py`; backfill the runs since 2026-11-04.
- `docs/AGENT-TEAM.md` and `CLAUDE.md` point to the new files; `scripts/test-hooks.sh` either becomes the skill's `scripts/test-guard.sh` plus the local tests, or calls it.

## Out of scope
- Changing what the guard refuses. Every rule that exists today stays, with its test.
- Moving more agents to Sonnet. Decide later from the metrics.
- projects-template's own team (regenerated in its T1, design §14).

## Acceptance criteria
- [ ] A re-run of the installer with no flags reports nothing created, updated, merged or to merge (`.claude/agent-team.json` holds the options), and leaves no `*.agent-team.new` file.
- [ ] Every case in today's `scripts/test-hooks.sh` still exists and passes, in the skill's guard tests or the local ones; the count of guard cases does not go down.
- [ ] `scripts/test-lane.sh` passes: lane 1 gets its worktree, `.env`, database and ports, and is removed.
- [ ] `pnpm test:e2e` passes on the default ports (no lane).
- [ ] `/agents` in a new session lists all of today's agents, with `qa` on Sonnet and the others without a model line.
- [ ] After the backfill, `scripts/agent-stats.py report` lists every agent type in this repo, and a test agent run in a new session adds a row.
- [ ] `docs/AGENT-TEAM.md` documents the extension points this repo uses, and `CLAUDE.md` links it.

## Security notes
The guard is a safety rail for secrets, applied migrations, deploys, IAM and force pushes. The risk is a rule lost in the move. Every existing refusal must keep a passing test (criterion 2), and the `security-reviewer` reviews the guard diff. No runtime code, data or roles change.

## Approach (brief)
The move was proven on a throwaway copy of this repo on 2026-11-14 (projects-template design §14, item 7): no rule lost, the old 352 hook tests passing on the new guard. Repeat it here in a lane: run the installer with the options and packs above, move the repo's additions to the extension points, resolve any `.new` files, then run the guard, lane and e2e suites. If this repo has no base copies, rebuild them from the skill version that matches task 067's files, so the installer merges instead of flagging every file (done for invoice-bot on 2026-11-25).

## Test plan
- Guard: the skill's `scripts/test-guard.sh` plus `scripts/test-guard.local.sh`, compared case by case with today's `scripts/test-hooks.sh`.
- Lanes: `scripts/test-lane.sh` against the local Postgres.
- e2e: the full suite on default ports.
- Metrics: one agent run in a new session, then `scripts/agent-stats.py report --by run`.

## Progress log
- 2026-11-25 – Task written from the agent-metrics review of this repo's 204 agent runs.

## Parking lot
- Whether reviewers or the infra agent can move to Sonnet: decide from the metrics after about five tasks.
- A cap on infra-agent runs (task 068's 234 turns): split infra work into smaller briefs.
