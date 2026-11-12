# Task 090: Too many wrong passwords lock sign-in to that account for a while

- **Status:** in-review
- **Milestone:** cross-cutting (security)
- **Zone / package:** `packages/auth` (`server.ts` hooks, a small lockout module), `packages/db` (`schema.ts`: one table, one migration), `apps/shell/features/auth/login-form.tsx` (shows the message), `e2e/steps` (two new steps). Commit types `test` → `feat(auth)` / `feat(db)`.
- **Feature file:** `docs/features/authentication.feature` (three `@wip @task:090` scenarios)
- **Depends on:** task 089 (same files; merge after it).

## Why
The rate limit (task 089) counts per client address, so someone spreading guesses over many addresses can keep trying one person's password. Counting failures per account, and pausing sign-in to that account after several in a row, caps guesses whatever the address. Register **SEC-10** (lockout part).

## Scope
- **Rule** (questions 1–2): after **5** failed sign-ins to the same email within **15 minutes**, sign-in to that email is refused for **15 minutes** from the last failure, even with the right password. A successful sign-in resets the count.
- **Message** (question 3): **"Too many failed sign-ins. Try again in 15 minutes."**, shown on the login form like "Invalid email or password".
- **No account discovery:** an email with no account counts and locks exactly the same way and shows the same messages, so the lock doesn't reveal which emails have accounts (sign-in today gives the same answer for both; keep it that way).
- **Storage:** a table keyed by a keyed hash of the normalized email (HMAC with the auth secret), never the email itself, with the failure count, the window start and the lock end. No RLS, like Better Auth's own tables (ADR-0006); `hardening.db.test.ts`'s exception list gains it; old rows are removed when they're past their window (on the next write for that key, or a simple delete of expired rows on write; implementer names it).
- Implemented with Better Auth hooks around `/sign-in/email` (before: refuse when locked; after: count a failure or reset on success). `AUTH_DISABLE_RATE_LIMIT` does **not** turn the lockout off (it is about addresses, not accounts), so the scenarios run with it on.

## Out of scope
- Unlocking by email (no email provider: SEC-09, owner decision) or by an admin.
- CAPTCHA or progressive delays.
- Notifying the account owner of failed sign-ins.

## Acceptance criteria
- [x] After 5 wrong passwords, the right password is refused with "Too many failed sign-ins. Try again in 15 minutes." → "Too many wrong passwords lock the account for a while"
- [x] A locked account doesn't lock anyone else. → "A locked account doesn't lock other accounts"
- [x] An email with no account answers the same way. → "An email without an account answers the same after too many tries"
- [x] The lock ends 15 minutes after the last failure, and a success before the limit resets the count. → unit tests with a fake clock.
- [x] The table never holds an email: a DB test signs in wrong with a known email and finds no row containing it.
- [x] `hardening.db.test.ts` passes with the table in the documented exception list.

## Security notes
Touches `packages/auth`, the login form and a migration (a new table, default grants), so the `security-reviewer` runs. Trade-off the owner should know: anyone who knows an email can keep that person locked out by failing 5 times every 15 minutes (a nuisance, not a takeover); question 1 lets the owner pick. The table holds only hashes and counts, never shown or logged. Fixes the rest of register gap **SEC-10** (with task 089).

## Approach (brief)
Red: the three scenarios (today the 6th attempt with the right password succeeds) and the lockout unit tests. Then the table, the module (pure rule + store), the hooks, the form message. No ADR unless the owner picks a different rule.

## Test plan
- Acceptance: three `@task:090` scenarios in `authentication.feature`.
- Unit: the lockout rule with a fake clock (5th failure, window expiry, reset on success).
- DB: no raw email stored; hardening exception.
- Storybook: the login form's error state already exists; the new message uses it (story arg if the form story lists messages).
- **New steps:** `I log in with the wrong password {int} times`, `another account was locked by {int} wrong passwords` (a person from the `people` fixture), `I log in with an email that has no account {int} times`, `I log in with that email once more` (the same made-up email, kept in the scenario state). Reused: `an existing account`, `I am on the login page`, `I log in with my email and password`, `I see my email address`, `I see the error {string}`.

## Open questions
1. **Lockout at all, or only the shared rate limit (task 089)?** Default: lockout as above; the nuisance lockout in "Security notes" is the price.
2. **Numbers:** default 5 failures in 15 minutes, locked 15 minutes.
3. **Message:** default "Too many failed sign-ins. Try again in 15 minutes."

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-10); owner: "start fixing the P1 gaps".
- 2026-11-10 – Started in lane 2, based on task 089's branch (PR #83, not merged). Owner (2026-11-10): lockout yes, 5 failures in 15 minutes lock the account for 15 minutes, message "Too many failed sign-ins. Try again in 15 minutes." Merge after the POC demo on 2026-11-13, after 089.
- 2026-11-10 – Red: `@wip` off the three scenarios; steps for repeated wrong passwords, another locked account (`people` fixture, checks the lock over the API), and a made-up email (kept in the scenario state). All three fail because nothing locks yet (the 6th sign-in answers as before).
- 2026-11-10 – Red unit and DB tests (`3bc543f`: the rule with a fake clock, the plugin through Better Auth's memory adapter, the database store across two instances, the hardening exception and index); the module was a throwing stub so the commit typechecks. Green: `sign_in_lockout` (migration 0042, no RLS, default grants, index on `removable_after`; added to `check-runtime-role.mjs` and `rls-pins.mjs`) and the `signInLockout()` plugin in `packages/auth/src/sign-in-lockout.ts`, added in `authOptions`. Choices: every attempt is counted *before* the password check (locked row), so parallel guesses can't slip past the count; a success deletes the row, so a success before the limit resets the count and an attempt counts as a failure unless it succeeds. The lock runs 15 minutes from the 5th failure (later attempts are refused without being counted, so they don't extend it). Cleanup deletes rows past `removable_after` (end of window or lock) on every write. The login form needed no change: it already shows the API error `message`. Nuisance lockout (see Security notes) stays as the owner accepted. Checks: auth unit 62 (without `DATABASE_URL`), auth DB 11, `@repo/db` DB 152, `pnpm test` all green, `@task:090` e2e 3/3, full e2e (`CI=1`, 2 workers) 326 passed, lint, typecheck, build, `check-runtime-role` and its 32 tests.
- 2026-11-10 – Security review fixes (no blockers): the store locks its row in the upsert (`on conflict (key) do update set key = excluded.key returning *`); before, `insert … do nothing` then `select … for update` lost attempts when another attempt's cleanup deleted the expired row in between (red DB test holds the row, waits until three attempts block behind it via `pg_locks`, deletes it; red 3/3 runs, green 3/3). The HMAC covers a purpose label (`sign-in-lockout\0` + email). Documented that rotating `BETTER_AUTH_SECRET` resets all counts. The cleanup stays on every write (one indexed delete; 1-in-N not worth the extra rule).

## Parking lot
- Unlock by email once there is an email provider (SEC-09).
- Show the account owner recent failed sign-ins (with SEC-28's account page).
- Better Auth logs "User not found" vs "Invalid password" at WARN on a failed sign-in (no email, but it tells the two apart in server logs); lower its log level or filter if logs ever become visible to non-operators.
