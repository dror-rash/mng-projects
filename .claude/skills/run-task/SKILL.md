---
name: run-task
description: Run the agent-team pipeline for one task (ADR-0010) - task-start, spec-writer red run, implementer green, access-auditor and reviewer in parallel, fix loop, qa, then lane-merge. Use when the user says "run task NNN", "push task NNN forward", or asks the team to do a task.
---

# Run task `<id>` through the team

You are the orchestrator: you dispatch and decide, you don't write the task's code. Each step is an `Agent` call with `subagent_type` set to the role. Every brief includes:
- the task id and lane number;
- the worktree path;
- "run commands with `scripts/lane.sh exec <n> -- …`";
- the commit attribution line from your system context.

After each agent returns, check its claims yourself (a `git log`, or a test run) before moving on.

1. **Start.** Run the `task-start` skill for `<id>` (readiness check, then lane). Stop on NOT READY.
2. **Red.** `spec-writer`: remove `@wip`, write the steps, show the red run. Check that each scenario fails for the reason the agent claims (look at the red output).
3. **Green.** `implementer`: TDD until the task's scenarios and the full suite pass in the lane. If it stops on a scenario it thinks is wrong, take that to the `planner` and the user. Never let anyone edit the scenario to pass.
4. **Review, in parallel** (one message, up to three Agent calls):
   - `access-auditor`, on any task touching data, pages, actions or migrations;
   - `security-reviewer`, when the diff touches the security-sensitive paths listed in `docs/SECURITY.md` (auth, middleware, `next.config.*`, route handlers, storage and uploads, `infra/`, `.github/`, `Dockerfile`, `.claude/`, `scripts/`, dependencies, or migrations with grants, policies or definer functions);
   - `reviewer`.

   Give them the branch and task, **not** the implementer's summary, so their read isn't anchored on it.
5. **Fix loop.** Send the blocker and should-fix findings, every CONFIRMED access finding, and every Critical, High or Medium security finding (PLAUSIBLE ones too, unless you show they aren't reachable) back to the `implementer` (continue it with `SendMessage` if it's still available). Re-review only what changed. Nits go in the PR as notes. Low and Info security findings go into `docs/security/register.md` as new gaps (P2 or P3) and are listed in the PR. Missing leak-suite scenarios go to the `planner` for the feature file, then to the `spec-writer`.
6. **QA.** `qa` on the lane. On FAIL, go back to step 5 with its report.
7. **Close.** Run the `dod` skill. Then:
   - set the task Status to `in-review`;
   - add a line to the plan's change log;
   - if the task fixes a gap in `docs/security/register.md`, set it to `fixed (PR #n)` once the PR exists;
   - push;
   - open the PR linking the task and feature file, with the DoD checklist and the attribution line.
8. **Merge** when CI `verify` and `e2e` pass (the `deploy` check fails until M11 is set up). Then run the `lane-merge` skill to clean up, and set the task to `done` in the next docs commit.

Several tasks can run at once in different lanes. Keep at most three lanes running e2e at the same time on this machine (dev servers are memory-heavy; see task 066).
