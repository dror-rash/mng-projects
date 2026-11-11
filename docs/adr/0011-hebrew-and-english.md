# ADR-0011: Hebrew and English (i18n and right-to-left)

- **Status:** proposed
- **Date:** 2026-11-11

## Context
The owner and their staff work in Hebrew. The app is English only (`<html lang="en">`), and every string is written inline in the components, server actions and parsers. The owner decided on 2026-11-11 that:
- the whole app is translated to Hebrew;
- English stays;
- each user switches between them;
- documents sent to customers (quotes, reports, bills; later milestones) follow the same two languages.

Hebrew is written right to left, so the layout has to mirror, not only the text. The app has two user-facing zones (shell: login and sign-up; dashboard: everything else) that share one origin and cookie domain (ADR-0001, ADR-0003). Shared components live in `packages/ui`. Since the owner's plan of 2026-11-11, every new screen has to be bilingual from the start, so the language foundation (milestone M14) comes before the project-flow milestones.

## Decision
- **Library:** `next-intl`, without its locale routing. Server components read messages with `getTranslations`, and client islands with `useTranslations`. It also gives ICU messages (plurals, values) and `useFormatter` for dates and numbers.
- **Languages:** `en` and `he`, defined once in a new package `@repo/i18n` as a `const` list. The package also holds `parseLocale`, each language's own name ("English", "עברית"), its direction (`ltr`, `rtl`), the cookie name and the formatters. An unknown value falls back to the default.
- **Which language a request gets, in this order:**
  1. the `locale` cookie, which is shared by every zone, like the theme cookie (task 036);
  2. the signed-in user's saved preference: written to the cookie when they sign in, and saved whenever they switch;
  3. the browser's `Accept-Language` (`he` if Hebrew comes before English, otherwise `en`);
  4. English.

  **The URL never carries the language.** No `/he/...` prefix, because a prefix would touch every rewrite between zones, the `basePath`s, the middleware, `safeNext`, every link and every e2e path, for an app behind a login that search engines never index.
- **Saved preference:** a `user_preference` table owned by our schema, under row-level security so each person reads and writes only their own row. It is **not** a column on Better Auth's `user` table: that would mean changing Better Auth's schema, and its tables have no RLS (SEC-38).
- **Direction:** each zone's root layout sets `<html lang dir>` on the server from the language, so the page never flashes.
  - Styling uses logical utilities (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`, `border-s`). Physical left and right utilities are refused by a lint rule in `packages/config`, except with an `rtl:`/`ltr:` variant.
  - Icons that point somewhere (chevrons, arrows) flip with `rtl:`.
- **Catalogues:** one JSON file per language per owner:
  - `packages/ui/messages/{en,he}.json` for shared components;
  - `apps/shell/messages/…` and `apps/dashboard/messages/…`.

  Keys are namespaced by feature (`projects.form.name`). A unit test per catalogue checks that `he` and `en` have the same keys and the same ICU placeholders, so a missing translation fails CI rather than showing a key.
- **Where text is translated:**
  - pages and components look messages up by key;
  - server actions translate on the server, with the request's language;
  - pure parsers (`*-input.ts`) and value-set helpers (`task-status.ts`, `organization-kinds.ts` and the like) return **message keys**, not English text, and the caller translates;
  - fixed value sets keep their stored values, and their labels move into the catalogues, keyed by value.
- **Dates and numbers:** formatted with `Intl` for the request's language (`he-IL` or `en-US`) through `@repo/i18n`'s formatters.
  - Calendar days keep `timeZone: "UTC"` until ADR-0007 (time zones) says otherwise.
  - The calendar is Gregorian in both languages.
  - Money (ILS) comes with the quotes milestone and its own ADR.
- **Font:** a font that covers Hebrew and Latin, self-hosted with `next/font` (Heebo or Assistant; picked in task 096 by how they look next to the current font). The current font stays for English if it lacks Hebrew glyphs.
- **What isn't translated:** what people type (customer names, notes, readings, file names). They show as typed, with `dir="auto"` on text that people write, so a Hebrew note reads correctly in the English UI and the other way round.
- **Tests:**
  - Feature files stay in English. Playwright's default browser language is English and no `locale` cookie is set, so every existing scenario runs in English, unchanged.
  - Hebrew gets a small smoke set in `docs/features/language.feature`: choosing Hebrew, the direction, and a few headings per area. Hebrew text in a scenario is the text the owner approved.
  - Completeness is the catalogue test's job, not e2e's.
- **Customer documents** (later milestones) are rendered in the language chosen for the document, defaulting to the customer's language. The PDF ADR (quotes milestone) has to support Hebrew right-to-left text.

## Alternatives considered
- **Locale in the URL (`/he/dashboard/...`, `next-intl` routing):** shareable language-specific links, but it changes every rewrite, path, middleware matcher, `safeNext` and e2e step, across zones, and a language switch becomes a navigation. Not worth it for a signed-in app.
- **`react-i18next` / `i18next`:** mature, but its server-component support is weaker and needs more glue for the App Router. `next-intl` is built for it.
- **Lingui (macros, extracted catalogues):** compact source, but it adds a compile step to two zones and Storybook. Revisit if the catalogues get hard to maintain.
- **Hebrew only:** simpler, but the owner wants both.
- **A `locale` column on Better Auth's `user` table (`additionalFields`):** fewer joins, but it changes Better Auth's schema and keeps the value outside RLS.
- **Browser language only, nothing saved:** each device would have to be switched again.

## Consequences
- **Good:**
  - one switch carries across zones and reloads;
  - no URL changes, so existing links, rewrites and e2e steps keep working;
  - missing translations fail CI;
  - new screens are bilingual from the start.
- **Bad / trade-offs:**
  - every existing screen has to be visited once to move its strings into catalogues (tasks 097–100);
  - reading the cookie in root layouts keeps routes dynamic (already true since task 036);
  - error strings stop being literals in parsers, so the unit tests compare keys;
  - the CLAUDE.md conventions on fixed value sets ("label helpers") and forms change. The owner edits CLAUDE.md;
  - Hebrew wording needs the owner's review.
- **Follow-ups:**
  - ADR-0007 (time zones) matters more for Israeli users after 21:00/22:00 local time ("today" is UTC);
  - the money ADR (quotes milestone) formats ILS through `@repo/i18n`;
  - the PDF ADR has to render Hebrew right to left;
  - a customer's language for documents (customer setting) comes with the first sent document.
