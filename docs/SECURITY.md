# Security review process

How security gaps are found, ranked, tracked and closed. The current list is the [gap register](security/register.md).

## The pieces
| Piece | What | Who | When |
|---|---|---|---|
| **Gap register** (`docs/security/register.md`) | Every known gap: id, priority, severity, status, source | Orchestrator keeps it; owner decides priorities and acceptances | Updated by every step below |
| **Task gate** | `access-auditor` and `security-reviewer` on the task's diff | `run-task` step 4 | Every task (the security reviewer when the diff touches its paths) |
| **CI checks** | Automated scans and tests that fail the PR | GitHub Actions | Every PR |
| **Full review** | Five area reviewers over the whole codebase and live config | `security-review` skill | Monthly, at every milestone, before go-live, and after a big change to auth, infra or files |
| **Release gate** | The register and live checks before a release | Orchestrator, owner signs off | Before the POC demo, before real customer data, before each release after that |
| **Dependency watch** | Advisories for the stack | Dependabot, weekly | Weekly and on alerts |

## Severity and priority
**Severity** is impact × how reachable it is today:
- **Critical:** anyone can take over production, or read or change other workspaces' data, now.
- **High:** the same, behind one realistic step (a stolen token, a fork PR, a single bug).
- **Medium:** a real attack on one user or a limited dataset, a costly outage, or a missing control that a High depends on.
- **Low:** defense in depth; needs an app bug, SQL access or an unusual setup.
- **Info:** worth knowing; a product decision or a future concern.

**Priority** decides when it's fixed:
- **P0 – fix now:** Critical and High, plus Medium with a small fix that guards production. Done before other work; the task gate blocks merging new work that adds a P0.
- **P1 – before real customer data on `main`:** fixed or accepted by the owner before go-live.
- **P2 – hardening:** scheduled with feature work, at least one per milestone.
- **P3 – information or a decision:** the owner decides; may stay open.

Evidence: every finding says **CONFIRMED** (shown by a code path, test, query or live read) or **PLAUSIBLE** (each link seen, the whole attack not run). A PLAUSIBLE High is ranked as High until disproved.

## Status lifecycle
`open` → `planned (task NNN)` → `in-progress` → `fixed (PR #n)` → `verified (review date)`; or `accepted (date, reason)`.
- Only the owner accepts a risk. An acceptance of a High or Medium also gets a line in an ADR or in the task that accepted it.
- A fix PR has a test that fails before the fix (rule 1): a unit or DB test, a leak-suite scenario, or a check in `infra/scripts/test-*.sh`. That test is what keeps the gap closed.
- The next full review re-checks every `fixed` gap and moves it to `verified`, or reopens it.

## Disclosure
The repo is public. For an open Critical, High or P0 gap, the register and the review report give a neutral title and the fixing task only; the evidence and attack path are added when it's fixed. Task files and PRs for those gaps describe the fix and its tests, not how to exploit the gap. Lower gaps are documented in full.

## 1. Task gate (in `run-task`)
- **Planner:** each task file gets a short "Security notes" section: what data and which roles the change touches, what could be misused, and whether it touches the security-sensitive paths below. New surfaces get partner, worker and auditor leak scenarios in the feature file.
- **Step 4, in parallel with the reviewer:**
  - `access-auditor` on any task touching data, pages, actions or migrations (unchanged);
  - `security-reviewer` when the diff touches: `packages/auth`, middleware, `next.config.*`, route handlers (`route.ts`), `packages/storage` or upload/download code, `infra/`, `.github/`, `Dockerfile`, `.dockerignore`, `.gitignore`, `.claude/`, `scripts/`, `package.json` or `pnpm-lock.yaml` (new or bumped runtime dependency), or migrations with grants, policies or definer functions.
- **Blocking:** a CONFIRMED Critical, High or Medium finding goes back to the implementer (the fix loop). A PLAUSIBLE one too, unless the orchestrator shows it isn't reachable. Low and Info findings go into the register (new id, P2 or P3) and are listed in the PR.
- **Register:** a task that fixes a gap sets its status to `fixed (PR #n)` in its docs commit; a task that accepts or defers one says so in the PR.

## 2. CI checks (every PR)
Each check is added by the gap that needs it; until then it's listed here as planned.

| Check | Catches | Gap | Status |
|---|---|---|---|
| RLS coverage DB tests (`hardening.db.test.ts`), `rls-pins.mjs`, runtime role check | Tables without RLS, unpinned policies, views or definer functions | — | in place |
| `infra/scripts/test-workflows.sh`, `test-deploy-service.sh` | Deploy steps that leak or mis-set env | — | in place; extend for `.dockerignore`, SHA pins, no `AUTH_DISABLE_RATE_LIMIT`/`ALLOW_PREVIEW_ORIGINS=true` on main | 
| `bash scripts/test-hooks.sh` in CI | Guard regressions | SEC-12 | planned |
| `pnpm audit --prod --audit-level=high` with a reviewed allowlist | Vulnerable runtime dependencies | SEC-11 | planned |
| gitleaks on the PR's commits | Committed secrets | SEC-11 | planned |
| `actionlint` + `zizmor` on `.github/workflows` | Unpinned actions, missing `permissions:`, injection, cache poisoning | SEC-05, SEC-15 | planned |
| Grants matrix DB test (no DELETE on soft-delete tables, no UPDATE/DELETE on append-only, every granted command has a policy) | Grants that undo the second lock | SEC-21 | planned |
| Trigger-defers-to-RLS DB test | Cross-workspace error oracles | SEC-36 | planned |
| Auth-gate script: every `page.tsx`/`route.ts` and every `"use server"` export reaches a session check; no unjoined `from(schema.user)` | A page or action without a server check | SEC-38 | planned |
| `safeNext` property test | Open redirects | SEC-03 | planned |
| Auth config test (`trustedOrigins`, secure cookies, rate limit on unless exactly `"true"`, minimum password length) | Auth config drift | — | planned |
| Header check on the preview (`curl -sI`) | Missing security headers, `x-powered-by` | SEC-19 | planned |
| Upload policy tests (no SVG/HTML/XML; signed length range and generation match) | Stored XSS, unbounded uploads | SEC-07 | planned |

## 3. Full review (`security-review` skill)
Five read-only reviewers in parallel, one per area, each with the same report format (findings with id, severity, CONFIRMED/PLAUSIBLE, `file:line`, attack, fix, effort; then "checked and fine"; then recurring checks):

| Area | Prefix | Agent |
|---|---|---|
| Authentication, sessions, invites, account lifecycle | AUTH | `security-reviewer` |
| Authorization, RLS, grants, definer functions, client payloads, leak suite | ACC | `access-auditor` |
| Web surface, headers, XSS, uploads and downloads, rewrites, logging | WEB | `security-reviewer` |
| GCP (Terraform and live IAM), workflows, Docker | INF | `security-reviewer` |
| Dependencies, secrets in the tree and history, dev switches, agent tooling, GitHub settings | SUP | `security-reviewer` |

The orchestrator then:
1. merges duplicates across areas into `SEC-nn` gaps (new ids continue the register's numbering);
2. re-checks every `fixed` gap and marks it `verified` or reopens it;
3. writes the evidence to `docs/security/reviews/<date>.md` and updates the register's table, counts and change log;
4. turns P0 gaps into tasks at once, and proposes tasks for P1 gaps to the owner;
5. sends missing leak-suite scenarios to the planner.

## 4. Release gate
Before the POC demo, before real customer data on `main`, and before each release after that:
- [ ] No open P0 gap. Before real customer data: no open P1 gap either (fixed or accepted by the owner).
- [ ] The last full review is less than a month old, or newer than the last change to auth, infra or file handling.
- [ ] Live checks (read-only):
  - branch protection on `main` with `verify` and `e2e` required (`gh api …/branches/main/protection`);
  - the deployed revisions' env has no `AUTH_DISABLE_RATE_LIMIT` and has `BETTER_AUTH_URL` (`gcloud run services describe`);
  - about five bad sign-ins in 10 s from one client get a 429, and a spoofed `X-Forwarded-For` doesn't reset it;
  - the security headers are present on the main URL;
  - `terraform plan` shows no security drift; no service-account keys; `allUsers` only where expected;
  - the latest `main` deploy log shows only masked credentials.
- [ ] Dependabot has no open High or Critical alert on a runtime dependency.

## 5. Dependency watch
Dependabot alerts and grouped weekly updates for npm (`next`, `better-auth`, `drizzle-orm`/`drizzle-kit`, `pg`, `@google-cloud/storage`, `sharp`) and github-actions. An advisory on a runtime dependency is triaged within a day: reachable → P0 task; not reachable → register entry with the reason, and the bump in the next weekly batch.

## Quarterly (owner)
- Review the agent permissions and auto-mode context for this repo (`.claude/settings.json`, `~/.claude/settings.json`) and the `gh` and `gcloud` credentials agent sessions use.
- Check the GCP Owner account's 2-step verification, and who has access to the repo and project.
