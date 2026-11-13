# Task 094: Language switch (Hebrew and English foundation)

- **Status:** in-review
- **Milestone:** M14 Hebrew and English
- **Zone / package:** new `packages/i18n`, `packages/ui`, `apps/shell`, `apps/dashboard`, `e2e`
- **Feature file:** `docs/features/language.feature` (`@task:094`)
- **Depends on:** ADR-0011 accepted (owner)

## Why
The owner and their staff work in Hebrew, and each user should be able to switch between Hebrew and English (owner, 2026-11-11). This task lays the foundation every later screen uses.

## Scope
- **`@repo/i18n`** (new package):
  - `LOCALES` (`en` "English", `he` "עברית"), `DEFAULT_LOCALE = "en"`, `parseLocale`, `localeDir` (`ltr`/`rtl`), `LOCALE_COOKIE = "locale"`;
  - `localeFromRequest(cookie, acceptLanguage)`: cookie, then `Accept-Language` (`he` if Hebrew ranks above English), then `en`;
  - `next-intl` request config helpers shared by both zones.
- **Both zones:**
  - `next-intl` without locale routing;
  - root `layout.tsx` sets `<html lang dir>` on the server;
  - catalogues `messages/en.json` and `messages/he.json`, plus `packages/ui/messages/…`;
  - a catalogue-parity unit test per catalogue (same keys, same ICU placeholders).
- **`LanguageSwitch`** in `packages/ui` (a radio group named "Language" showing "English" and "עברית"; Storybook: English chosen, Hebrew chosen, in RTL):
  - in the dashboard header (`AppHeader`), next to the theme toggle. The shell (login and sign-up) has no header or theme toggle yet; its switch comes with task 097;
  - choosing a language sets the cookie (one year, `SameSite=Lax`, path `/`) and refreshes the page.
- **Translated in this task:**
  - the three dashboard menu link labels only ("Overview" סקירה, "All projects" כל הפרויקטים, "Customers" לקוחות). "Log out", the nav label "Dashboard", the "Theme" group, the workspace switcher label and "in another workspace" stay English until task 098 ("Log out" is `SignOutButton`, task 097; the switcher is also in 099's scope). The e2e steps find them by those names, and their Hebrew wording isn't approved yet;
  - the language switch itself;
  - the login page heading ("Welcome back" ברוכים השבים).

  The rest of the screens follow in tasks 097–100. Until then, untranslated screens show English inside a right-to-left page.
- **Conventions,** written into `docs/ARCHITECTURE.md` ("Languages"):
  - catalogue layout and key naming;
  - parsers and value-set helpers return keys (ADR-0011);
  - `dir="auto"` on text that people write;
  - logical CSS utilities only.

  The CLAUDE.md wording on label helpers and forms needs the owner's edit; list it in the PR.

## Out of scope
- Saving the choice per user (task 095).
- The language switch on the login and sign-up pages (task 097).
- The rest of the dashboard header: the nav label, theme group and "in another workspace" (task 098), "Log out" (097), the workspace switcher (099).
- Mirroring the layout and fonts (task 096; pages may look wrong in Hebrew until then).
- Translating pages beyond the header, menu and login heading (097–100).

## Acceptance criteria
- [x] Choosing עברית shows the menu in Hebrew, right to left, and carries to the login page after logging out and across a reload. ("Choosing Hebrew turns the app right to left, across zones and reloads")
- [x] Choosing English switches back. ("Switching back to English")
- [x] With no choice made, a browser that prefers Hebrew gets Hebrew, and any other gets English. ("A Hebrew browser starts in Hebrew", "Any other browser starts in English")
- [x] A made-up `locale` cookie value is ignored. ("An unknown language in the cookie falls back")
- [x] Every existing scenario passes unchanged in English.

## Security notes
- New cookie `locale`, read on every request: the value must go through `parseLocale` before it reaches `lang`/`dir` or a catalogue import, never interpolated. Otherwise an attacker-set cookie could inject attributes or load an arbitrary module path.
- No data or roles touched; no access change.
- The diff touches `package.json`/`pnpm-lock.yaml` (new runtime dependency `next-intl`), `next.config.*` (the `next-intl` plugin) and possibly the middleware, so the `security-reviewer` runs.

## Approach (brief)
- Unit tests first: `parseLocale`, `localeFromRequest`, `localeDir`, the catalogue parity.
- Then the layouts, then the switch.
- Messages are loaded server-side per request. Client islands get only the namespaces they need through `NextIntlClientProvider`.
- No ADR beyond ADR-0011.

## Test plan
- **Acceptance:** `language.feature` `@task:094`.
- **New steps:**
  - `I choose the {string} language`
  - `the page is right to left` / `the page is left to right`
  - `my browser prefers {string}` (a context with `locale`)
  - `my language cookie is set to {string}`
- **Unit:** `@repo/i18n` functions; parity test.
- **Storybook:** `LanguageSwitch` (English, Hebrew, RTL).

## Open questions
1. **Default for someone who never chose:** browser language, then English (as above)? *Default:* yes. Hebrew for everyone would turn the e2e browser Hebrew too.
2. **Hebrew labels:** "סקירה", "כל הפרויקטים", "לקוחות", "ברוכים השבים". *Default:* these; the owner corrects them on the preview, and a wording change is a `docs(features):` commit.

## Progress log
- 2026-11-11 – Drafted with `language.feature` (`@wip`) from the owner's decision (bilingual, per-user switch).
- 2026-11-13: started in lane 1 (feat/language-switch); scope clarified (menu labels only; shell switch moved to 097).
- 2026-11-13: acceptance steps written (`e2e/steps/language.steps.ts`), `@wip` off the five `@task:094` scenarios; red run: no "Language" radio group in the dashboard header, and `<html>` has no `dir`.
- 2026-11-13: implemented (green):
  - `@repo/i18n`: locale helpers, `localeFromRequest`, `./server` (`requestLocale`, `createRequestConfig`), `./catalogue` (`catalogueDifferences`);
  - `LanguageSwitch` in `packages/ui`, with stories (English, Hebrew, right to left), and `packages/ui/messages`;
  - both zones on `next-intl` 4.14.9 (exact; `use-intl` and `icu-minify` kept at 4.14.9 by overrides), `<html lang dir>` from the server, catalogues with parity tests;
  - the menu labels (`navFor` returns keys), the login heading, and the switch in the dashboard header. The header's controls now wrap at 360px.
- 2026-11-13: one fix to the red commit's step code, no scenario changed: `my browser prefers` used `setExtraHTTPHeaders`, which Chromium replaces with its own Accept-Language (`en-US`), so it now rewrites the header with `context.route`.
- 2026-11-13: a change to my own component during the green work: the switch's radios were `sr-only`, which Playwright (and a pointer) can't click, so they now lie transparent over their labels.
- 2026-11-13: the switch's name is "Language" in English and "שפה / Language" in Hebrew. Scenario 2 finds the group by "Language" on a Hebrew page, and keeping the English word helps anyone find the switch. For the owner to confirm with the other Hebrew wording.
- 2026-11-13: e2e status in lane 1. Every upload scenario fails, and so do some readings scenarios at random. The same happens on the commit before this task (487eec1: 10 of 22 failed in `readings` + `attachments`). Cause: the shared storage container answers CORS preflights with 403 (its bucket was recreated at 18:02 UTC), and the machine is under load (load average about 17).
- 2026-11-13: final runs in lane 1: unit 651 passed; `@task:094` e2e 5/5; full e2e 299 passed, 35 failed (uploads, plus timeouts that move from run to run). Rerun alone, `workspace-switching`, `workspaces`, `task-assignees`, `soft-delete` and `task-details` gave 44 passed; the only 2 failures were uploads. lint, typecheck, build and build-storybook pass.
- 2026-11-13: review fixes (access audit: no findings; security: no blocking findings):
  - the catalogue check no longer takes plural/select branch text for placeholders (walks the ICU message; no new dependency);
  - header controls: `ms-auto`, and `min-w-0` with `xl:flex-nowrap` back so the email truncates at xl;
  - narrower catalogue tests, and a note on page routes in the `my browser prefers` step;
  - SEC-49, SEC-50 and SEC-51 (P3) in the security register.

  Reruns after the storage container was recreated: unit 654 passed; lint and typecheck pass; `@task:094` 5/5; `zone-navigation`, `workspace-switching`, `attachments`, `reports` and `workspaces` gave 50 passed.

## Parking lot
- A third language.
- Language-specific email templates (no email yet).
- The example zone keeps `<html lang="en">` without `dir` (not a user-facing zone).
- `next-intl` 4.14 brings `@swc/core` and `@parcel/watcher` (native) for its message extractor, which we don't use. Revisit if a later release makes them optional.
