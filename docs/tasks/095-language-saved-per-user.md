# Task 095: Each user's language is saved

- **Status:** todo
- **Milestone:** M14 Hebrew and English
- **Zone / package:** `packages/db`, `packages/i18n`, `apps/shell`, `apps/dashboard`, `e2e`
- **Feature file:** `docs/features/language.feature` (`@task:095`)
- **Depends on:** task 094; ADR-0011

## Why
"Each user can switch" (owner, 2026-11-11): a user who chose Hebrew on their phone should get Hebrew on the office computer too, without choosing again.

## Scope
- **Migration (one):** `user_preference` (`user_id` primary key → `user.id` on delete cascade, `locale` text with a check on `('en','he')`, `updated_at`).
  - RLS: a person selects, inserts and updates only their own row (`user_id = current_setting('app.user_id')`); no delete grant.
  - Pinned in `infra/scripts/rls-pins.mjs`.
- **Switching while signed in** saves the choice (upsert inside `withAccess`) as well as setting the cookie. Signed out, only the cookie changes.
- **Signing in** (shell, after a successful login) sets the `locale` cookie from the saved preference when there is one. Without one, the current cookie or browser language stays and is not saved until the user switches.
- **Signing up** saves the language the sign-up page was in.
- **Logging out** keeps the cookie, so the login page stays in the user's language.

## Out of scope
- A profile or settings page (the switch in the header is the setting).
- A workspace-wide default language.

## Acceptance criteria
- [ ] A user who chose עברית gets Hebrew after logging in from another browser. ("My language follows me to another browser")
- [ ] A user who never chose keeps the browser's language after logging in. ("Without a saved choice, the browser's language stays")
- [ ] Two users on one browser each get their own saved language at login. ("Each person gets their own language on a shared computer")
- [ ] Nobody can read or change another user's preference (DB test: RLS on `user_preference`).

## Security notes
- New table with personal data (a language choice); RLS by the current user only, no access-function change.
- The login hook touches `packages/auth` or the shell's auth flow, so the `security-reviewer` runs.
- The post-login redirect must still go through `safeNext`.
- A grants test: `app_user` has no delete and no access to other rows.
- The cookie value from the database is still parsed with `parseLocale`.

## Approach (brief)
- DB test first (RLS: own row only), then the upsert in `@repo/i18n`'s server helper.
- The shell's sign-in success path reads the preference through `withAccess(user.id, …)` and sets the cookie before redirecting.

## Test plan
- **Acceptance:** `language.feature` `@task:095`.
- **New steps:**
  - `I log in from another browser` (a fresh context from `people`, same account);
  - `the teammate logs in on this browser`, reusing the teammate fixture.
- **DB:** `user-preference.db.test.ts`.
- **Unit:** the choose-on-sign-in rule.

## Open questions
1. **Does a saved choice override a different cookie on a shared computer?** *Default:* yes, the signed-in person's saved choice wins at login.

## Progress log
- 2026-11-11 – Drafted with `language.feature` (`@wip`).

## Parking lot
- Other per-user preferences (theme) in the same table.
