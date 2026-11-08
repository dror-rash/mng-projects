# Task 077: Security review process and first full review

- **Status:** in-review
- **Milestone:** cross-cutting
- **Zone / package:** `docs/`, `.claude/`
- **Feature file:** none (process and docs only)

## Why
The owner asked (2026-11-08) for a full security review, a prioritized list of the security gaps with their status, and a review process that fits the agent-team pipeline.

## Scope
- The first full review (five read-only area reviewers) and its report, `docs/security/reviews/2026-11-08.md`.
- The gap register, `docs/security/register.md` (41 gaps, P0–P3, with status).
- The process, `docs/SECURITY.md`: severity and priority, statuses, the task gate, CI checks, the full review, the release gate, the dependency watch.
- The `security-reviewer` agent and the `security-review` skill; `run-task` step 4 and 5, the `dod` skill, `AGENT-TEAM.md`, `WORKFLOW.md`, the task template ("Security notes") and the CLAUDE.md read order.

## Out of scope
- Fixing any gap. P0 gaps get their own tasks once the owner has seen the register.
- GitHub and GCP setting changes (owner only).

## Acceptance criteria
- [x] Every finding of the five reviewers is in the register, merged across areas, with severity, priority, status and source.
- [x] The process says who runs what and when, and how a gap moves from open to verified or accepted.
- [x] `run-task` runs the `security-reviewer` when the diff touches security-sensitive paths.

## Progress log
- 2026-11-08 – Lane 1. Five reviewers (AUTH, ACC, WEB, INF, SUP) on `main` at 76d6e83, read only. 1 High (SEC-01, PLAUSIBLE; details held back until fixed), 12 Medium, the rest Low and Info. No access leak between workspaces found through the app.

## Parking lot
- Turn the P0 gaps (SEC-01 to SEC-05) into tasks.
- `AGENTS.md` is still a stale copy of `CLAUDE.md` (it doesn't get the new read-order line).
