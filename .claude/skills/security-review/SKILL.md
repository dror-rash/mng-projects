---
name: security-review
description: Run the full security review of the whole codebase and live config (docs/SECURITY.md) - five read-only area reviewers in parallel (AUTH, ACC, WEB, INF, SUP), then merge their findings into the gap register with priorities, re-check fixed gaps, and write a dated review report. Use monthly, at a milestone, before go-live or a release, after a big change to auth, infra or files, or when the user asks for a security review or the security status.
---

# Full security review

You are the orchestrator. The reviewers read; you merge, rank and write. The process and the definitions of severity, priority and status are in `docs/SECURITY.md`; the list is `docs/security/register.md`.

1. **Lane.** Do the docs work in a lane (`scripts/lane.sh up <n> docs/security-review-<date> origin/main`). Note the `main` commit you review.
2. **Brief five reviewers, in one message** (five Agent calls, run in the background). Each brief has: the repo path and commit; the area; "read only: never edit, commit, deploy or change GitHub or GCP; no Playwright; never print secrets"; "read `docs/security/register.md` first and name known gaps by `SEC-nn`, saying whether each is still open"; and the report format in `security-reviewer.md`.
   - `security-reviewer`, area **AUTH**;
   - `access-auditor`, a whole-codebase audit (not a diff), area **ACC**, including the leak-suite coverage;
   - `security-reviewer`, area **WEB** (may `curl -sI` the main URL);
   - `security-reviewer`, area **INF** (read-only `gcloud` and `gh api`, `terraform plan` if it runs without prompting);
   - `security-reviewer`, area **SUP** (`pnpm audit`, history scan, GitHub settings).
3. **Check before you trust.** For every new High or Critical, and every finding that would be P0, re-check the key link yourself (read the `file:line`, run the probe). Downgrade or drop what doesn't hold, and say so in the report.
4. **Merge into the register:**
   - merge duplicates across areas into one `SEC-nn` (continue the numbering; never reuse an id);
   - set severity, then priority (P0–P3) by the rules in `docs/SECURITY.md`;
   - re-check every `fixed` gap: `verified` if it holds, back to `open` if not;
   - update the counts table and add a change-log line.
5. **Report.** Write `docs/security/reviews/<date>.md`: commit, method, findings by `SEC-nn` with evidence and fixes, missing leak-suite scenarios, "checked and fine".
6. **Follow-up:**
   - P0 gaps: a task each now (via the `planner`), and tell the owner;
   - P1 gaps: propose tasks to the owner;
   - owner-only items (GitHub or GCP settings, risk acceptances, product decisions): list them for the owner;
   - leak-suite scenarios: to the `planner`.
7. **Commit and PR.** `docs(security): review <date>`, with the counts and the P0 list in the PR body. Merge as for any docs PR.

Tell the owner: counts by priority, the P0 list with one line each, and what needs their decision.
