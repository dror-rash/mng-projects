# Task 094: Language switch (Hebrew and English foundation)

- **Status:** todo
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
  - in the shell header (login and sign-up) and the dashboard header (`AppHeader`), next to the theme toggle;
  - choosing a language sets the cookie (one year, `SameSite=Lax`, path `/`) and refreshes the page.
- **Translated in this task:**
  - the dashboard header and menu ("Overview" סקירה, "All projects" כל הפרויקטים, "Customers" לקוחות);
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
- Mirroring the layout and fonts (task 096; pages may look wrong in Hebrew until then).
- Translating pages beyond the header, menu and login heading (097–100).

## Acceptance criteria
- [ ] Choosing עברית shows the menu in Hebrew, right to left, and carries to the login page after logging out and across a reload. ("Choosing Hebrew turns the app right to left, across zones and reloads")
- [ ] Choosing English switches back. ("Switching back to English")
- [ ] With no choice made, a browser that prefers Hebrew gets Hebrew, and any other gets English. ("A Hebrew browser starts in Hebrew", "Any other browser starts in English")
- [ ] A made-up `locale` cookie value is ignored. ("An unknown language in the cookie falls back")
- [ ] Every existing scenario passes unchanged in English.

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

## Parking lot
- A third language.
- Language-specific email templates (no email yet).
