# Task 097: Translate login and sign-up

- **Status:** todo
- **Milestone:** M14 Hebrew and English
- **Zone / package:** `apps/shell`, `packages/auth` (`SignOutButton` text only), `packages/ui`, `e2e`
- **Feature file:** `docs/features/language.feature` (`@task:097`)
- **Depends on:** tasks 094 and 096

## Why
The first screens a Hebrew-speaking user meets are the login and sign-up pages.

## Scope
- **Shell pages:**
  - login, sign-up and the not-found page: their headings, labels, buttons, links and helper text;
  - the inline field errors and the auth errors as the user sees them: "Invalid email or password", the lockout message if task 090 has landed, "Enter a valid email address", the password length message;
  - Better Auth error codes are mapped to catalogue keys, never shown raw.
- **`SignOutButton`** ("Log out" התנתקות).
- **Messages** in `apps/shell/messages/{en,he}.json` and `packages/ui/messages/…`; the parity test passes.

## Out of scope
- Email texts (no email yet).
- Dashboard pages (098–100).

## Acceptance criteria
- [ ] In Hebrew the login page reads "ברוכים השבים" with Hebrew labels, and a wrong password shows "אימייל או סיסמה שגויים". ("The login page in Hebrew")
- [ ] In Hebrew the sign-up page is Hebrew and an invalid email shows "יש להזין כתובת אימייל תקינה". ("The sign-up page in Hebrew")
- [ ] Every existing shell scenario passes unchanged in English.

## Security notes
- Auth error mapping must not reveal more than today: the same message for an unknown email and a wrong password.
- Touches the shell's auth pages and maybe `packages/auth`, so the `security-reviewer` runs.

## Approach (brief)
Move the strings into keys page by page; the error map is unit tested (`auth-error-key.test.ts`).

## Test plan
- **Acceptance:** `language.feature` `@task:097`, reusing the login steps.
- **Unit:** the error map; parity.

## Open questions
1. **Hebrew wording:** "ברוכים השבים", "אימייל או סיסמה שגויים", "יש להזין כתובת אימייל תקינה". *Default:* these, reviewed by the owner on the preview.

## Progress log
- 2026-11-11 – Drafted with `language.feature` (`@wip`).

## Parking lot
- Gendered Hebrew forms (the default is plural/neutral wording).
