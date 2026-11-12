# Task 096: Right-to-left layout, Hebrew font, dates and numbers by language

- **Status:** todo
- **Milestone:** M14 Hebrew and English
- **Zone / package:** `packages/ui`, `packages/config`, `packages/i18n`, `apps/shell`, `apps/dashboard`, `e2e`
- **Feature file:** `docs/features/language.feature` (`@task:096`)
- **Depends on:** task 094; ADR-0011

## Why
In Hebrew the page has to mirror: the menu on the right, icons pointing the right way, columns and forms in reading order, with a font that has Hebrew letters and dates written the Israeli way.

## Scope
- **Logical CSS everywhere:**
  - replace physical `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/border-l/border-r/rounded-l/rounded-r` with their logical forms in `packages/ui` and both zones;
  - a lint rule in `packages/config` refuses the physical forms (allowed only with `rtl:`/`ltr:`);
  - icons that point (chevrons, arrows, the board's drag handle hints) flip with `rtl:`.
- **Charts** (home page) and the **task board** read right to left in Hebrew: columns To do → In progress → Done from the right.
- **Font:** a Hebrew-and-Latin font with `next/font`, self-hosted (Heebo or Assistant: the implementer shows both on the preview; *default* Heebo), used when the language is `he`.
- **Dates and numbers:**
  - `@repo/i18n` formatters (`formatDay`, `formatDateTime`, `formatNumber`), with `he-IL` / `en-US` and `timeZone: "UTC"` kept (ADR-0007 pending);
  - every `toLocaleDateString`/`Intl.DateTimeFormat` call in the zones goes through them;
  - in Hebrew a due date shows like "18.11.2026".
- **Typed text** (names, notes, readings, file names) gets `dir="auto"`.
- **Storybook:** a toolbar toggle for language and direction. Every existing story renders in RTL without a11y violations.

## Out of scope
- Translating page text (tasks 097–100).
- Time zones (task 041).

## Acceptance criteria
- [ ] In Hebrew the menu sits on the right and no page scrolls sideways at 360, 768 and 1024 px. ("In Hebrew the layout mirrors and fits a phone")
- [ ] In Hebrew a task's due date shows as day.month.year. ("Dates follow the language")
- [ ] A Hebrew note shows right to left inside the English page. ("Text people write keeps its own direction")
- [ ] The lint rule refuses `ml-2` in a component (unit test of the rule).

## Security notes
No data, roles or access change; no new runtime dependency beyond the font files (self-hosted, no third-party request). No security-sensitive paths, unless `next.config.*` changes for fonts (then the `security-reviewer` runs).

## Approach (brief)
- The lint rule first (red on today's code), then a mechanical sweep per package, then the formatters with unit tests, then the board and charts.
- Screenshots of every page in Hebrew (`pnpm --filter @repo/e2e screenshots` with the cookie) go in the PR.

## Test plan
- **Acceptance:** `language.feature` `@task:096`, reusing `my screen is {int} pixels wide` and `the page does not scroll sideways`.
- **New steps:**
  - `the menu is on the right`;
  - `the task {string} shows the due date {int} days from today written day.month.year`.
- **Unit:** formatters; lint rule.
- **Storybook:** RTL toggle; every story in RTL.

## Open questions
1. **Font:** Heebo or Assistant? *Default:* Heebo; the owner chooses on the preview.
2. **Date style in Hebrew:** "18.11.2026" or "18 בנוב׳ 2026"? *Default:* "18.11.2026" in tables and fields, long form in headings.

## Progress log
- 2026-11-11 – Drafted with `language.feature` (`@wip`).

## Parking lot
- Hebrew calendar dates alongside Gregorian ones.
