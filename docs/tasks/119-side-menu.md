# Task 119: A side menu instead of the dashboard's top header

- **Status:** in-review
- **Milestone:** M21 Side menu and palette
- **Zone / package:** `packages/ui` (new Sidebar parts and a Sheet, `lucide-react`), `apps/dashboard` (`features/layout`, the 27 pages that render `AppHeader`, `messages/en.json` and `he.json`), `e2e` (layout steps, screenshots)
- **Feature file:** `docs/features/home-and-menu.feature` (`@task:119`); one `@task:119` outline in `docs/features/zone-navigation.feature`; one existing outline changed (below)
- **Depends on:** task 118 (the `--sidebar-*` tokens and the palette). Shares one step with task 096 (`the menu is on the right`): whichever lands first defines it.

## Why
On a phone today's header takes three rows before any content, and on desktop seven controls share one line (approved design proposal "Waypoint Side Menu", 2026-11-15). A Vercel-style side menu keeps the workspace, the pages and the account in one fixed place, and folds into a drawer on a phone. Pages keep their content and routes; only the frame around them changes.

## Owner decisions (2026-11-15, approved with the proposal)
- **Menu items:** the same as today: Overview, All projects, and Customers for the roles that see customers (`navFor`, task 070). My tasks, Forms, Partners and Members stay reachable by address.
- **No desktop collapse:** the menu stays open at 236px; no icon-only mode.
- **Account controls are visible buttons** at the bottom (language, theme, log out), not a ⋯ menu.
- **Dark charcoal menu** (the 30% of the palette, task 118); the light menu was rejected by the approval.
- **On the start side:** the menu is on the left in English and on the right in Hebrew (the app already sets `dir="rtl"`).

## Scope
### `packages/ui`: Sidebar parts (shadcn pieces, each with a story)
- **`Sheet`** (shadcn, on `@radix-ui/react-dialog`): focus stays inside while open, Esc closes it, focus goes back to the button that opened it. It opens from the inline-start side (so from the right in Hebrew).
- **`Sidebar` frame:** the fixed 236px column on the inline-start side from `lg` (1024px) up, on `bg-sidebar` with `text-sidebar-foreground`; slots for the top (switcher), the middle (nav) and the bottom (account).
- **`SidebarLink`:** icon + label; marks the current page with `aria-current="page"` and the `--sidebar-accent` fill. A small client island (`"use client"`, `usePathname`) that only decides "current"; the rest stays server-rendered.
- **Phone top bar:** below `lg`, a bar on `bg-sidebar` with the menu button (accessible name "Open menu"), the W mark and the workspace name; the menu opens in the `Sheet` with the same three parts.
- **`lucide-react`** added to `packages/ui` for the icons (menu, overview, projects, customers, chevrons-up-down, sun/moon, log out). Icons are `aria-hidden`; every control keeps a text name.
- Logical CSS only (`ms-`, `ps-`, `start-`, `border-e`, …), so the menu mirrors in Hebrew without `rtl:` overrides; the up-down chevron doesn't need to flip.

### `apps/dashboard`: `AppHeader` becomes `AppSidebar`
- **Top: workspace switcher**, a link to `/workspaces` with the W mark (`--accent`), the workspace name, the role badge and an up-down chevron.
  - The accessible name stays `"<workspace>: switch workspace"` (`aria-label`), so `workspace-switching.feature` keeps passing.
  - The "in another workspace" hint stays under the name on record pages (`otherWorkspace`).
  - The role badge shows my role in the current workspace with the existing labels (`workspaceRoleLabel`: Admin, Auditor, Worker, Partner). The proposal said "Admin, Member, Auditor"; "Member" was replaced by these four roles in M12.
- **Middle: nav**, `<nav aria-label="Dashboard">` with the items from `navFor(role)`, icon + label, labels from the `nav` messages as today.
  - **Which item is current** (*default*): Overview on `/dashboard` only; All projects on `/dashboard/projects` and everything under it (a project, its tasks and visits); Customers on `/dashboard/customers` and everything under it. Other pages (sites, My tasks, Forms, Partners, Deleted, workspace pages) mark no item.
- **Bottom: account**, the initials avatar (from the user's name, or the email when there is no name) and the email, then `LanguageSwitch`, `ThemeToggle` and `SignOutButton` as visible buttons, restyled for the charcoal surface. No ⋯ menu.
- **Phone (below `lg`):** the top bar and the drawer as above. Choosing a page in the drawer opens it and closes the drawer.
- **One shared frame:** a server component (`features/layout/app-frame.tsx`, *name is the implementer's*) takes `email`, `role`, `workspaceName`, `otherWorkspace` and the page content, and renders the side menu, the phone top bar and `<main>`. Each of the 27 pages that renders `<AppHeader …/>` + `<main>` switches to it (a mechanical change; page content doesn't change). `app-header.tsx` goes.
- **New text** in both catalogues (ADR-0011), *default wording, the owner reviews on the preview*: "Open menu" / "פתיחת התפריט", "Close menu" / "סגירת התפריט". Role labels stay English until the members screens are translated (M14).

### Existing scenario changed (one `docs(features):` commit at the start of the task, reason in its body)
- **`zone-navigation.feature`, "The dashboard header fits a <width>px wide screen" (`@task:030`):** the rows `360` and `768` go. Below 1024px the nav links are inside the closed drawer, so "every dashboard nav link is on screen" can't hold before the menu is opened. Those widths move to the new `@task:119` outline "The dashboard menu fits a <width>px wide screen once opened". The `1024` row stays (the side menu is open there).

### Existing scenarios that keep their wording
- `the dashboard menu links are …` (`home-and-menu`, `language`, `partner-access`), `the header shows the workspace …`, `the header says …` / `does not say …` (`workspace-switching`, `soft-delete`), `the header has no … link` (`partner-access`, `soft-delete`), `the teammate sees no … link in the header` (`partners`).
- Their steps in `e2e/steps/layout.steps.ts` (and `partner-access.steps.ts`, `partners.steps.ts`) look inside the page's `banner` landmark today. They are pointed at the menu frame instead (the side menu on desktop, the top bar or the open drawer on a phone), without changing any scenario text. "Header" in those steps now reads as "the menu frame".
- **Customers hidden for roles that can't see customers** is already covered: `partner-access.feature` ("the dashboard menu links are "Overview, All projects"", "the header has no "Customers" link", `@task:070`) and `navFor`'s unit test per role. No new scenario.

## Out of scope
- The palette and the `--sidebar-*` tokens (task 118).
- New menu items, page content, routes, or what any page shows.
- The shell's login and sign-up pages and the example zone (they have no dashboard header).
- Translating the role labels or the "in another workspace" hint (M14, tasks 098–100).

## Acceptance criteria
- [ ] The menu marks the page I'm on, including a project page under All projects, and marks nothing on a page outside the menu. ("The menu marks the page I am on")
- [ ] The menu shows my workspace with my role, my email and the log out button. ("The menu shows my workspace, my role and my account"). The language switch and theme toggle in the menu stay covered by the existing scenarios that use them from `/dashboard` (`language.feature` `@task:094`, the theme scenarios in `landing-and-login.feature`).
- [ ] On a phone the menu is closed, opens from the menu button, and closes with Esc. ("On a phone the menu opens from a button and closes with Escape")
- [ ] On a phone, choosing a page in the menu opens it and closes the menu. ("On a phone, choosing a page in the menu opens it and closes the menu")
- [ ] On a phone I can log out from the menu. ("On a phone I log out from the menu")
- [ ] In Hebrew the menu is on the right. ("In Hebrew the menu is on the right")
- [ ] At 360 and 768px, once opened, every menu link is on screen and the page doesn't scroll sideways; at 1024px the side menu is open and fits. ("The dashboard menu fits a <width>px wide screen once opened"; the changed `@task:030` outline)
- [ ] Every existing scenario passes, with only the `@task:030` change above.
- [ ] Storybook: the frame, `SidebarLink` and the phone drawer have stories for: a current item, hover, light and dark, right to left, the drawer open and closed; the a11y addon shows no new violations.
- [ ] `pnpm --filter @repo/e2e screenshots` and `pnpm --filter @repo/e2e flow-guide` rerun after the change, attached to the PR (the usage guide shows the new frame).

## Security notes
- No data, roles, actions or access rules change. The menu shows the same items per role as today (`navFor`, unchanged) and the workspace name, role and email of the signed-in user, which the header already shows (except the role, which is the user's own). Every page keeps its `requireWorkspace` / `getSession` call; the frame receives what the page already read.
- Customers stays hidden for partners and workers (`canSeeCustomers`); the `@task:070` leak scenario in `partner-access.feature` keeps guarding it.
- **New runtime dependencies** (`lucide-react`, `@radix-ui/react-dialog`) change `package.json` and `pnpm-lock.yaml`, so the `security-reviewer` runs (`docs/SECURITY.md`, step 4): pinned versions, `pnpm audit` clean. The `access-auditor` runs because the task touches every page (a mechanical change; it checks no page lost its session or workspace check).

## Approach (brief)
- **Red first:** the `docs(features):` commit for the `@task:030` rows, then remove `@wip` from the `@task:119` scenarios and add the new steps (`the menu marks {string} as the current page`, `no menu item is marked as the current page`, `I open the menu`, `I close the menu with the Escape key`, `the dashboard menu is closed`, `the menu is on the right` unless task 096 has added it); show the red run.
- **Unit:** the "which item is current" rule as a pure function next to `navFor` (`currentNavItem(pathname, items)`), tested per path above; `SidebarLink` component test (`aria-current` on the current link only).
- **Then** the `packages/ui` parts with stories, `AppSidebar` and the frame, and the page sweep in one commit.
- **No ADR:** a layout change inside one zone, built from shadcn pieces already in the design system; it reverses by restoring the header. `lucide-react` is shadcn's own icon set (the default for shadcn components). `docs/ARCHITECTURE.md` gets a line under the dashboard's layout conventions (the frame component, the menu on the start side).
- Task 096's lint rule refuses physical CSS classes; using logical classes here keeps this task compatible whichever lands first. If task 096's Storybook direction toggle isn't there yet, the RTL stories wrap the part in `dir="rtl"`.

## Test plan
- **Acceptance:** `home-and-menu.feature` and `zone-navigation.feature` `@task:119`; the changed `@task:030` outline; the full suite.
- **New steps:** listed under "Approach"; the layout steps re-pointed from the `banner` landmark to the menu frame.
- **Unit/component:** `currentNavItem`; `SidebarLink`; `navFor` unchanged.
- **Storybook:** `Sheet`, `Sidebar` frame (desktop, light and dark, LTR and RTL, with the "in another workspace" hint), `SidebarLink` (current, hover, focus), the phone top bar with the drawer open and closed.
- **Screenshots:** `screenshots` and `flow-guide` rerun, in the PR.

## Progress log
- 2026-11-15 – Drafted from the owner-approved design proposal ("Waypoint Side Menu"); owner decisions recorded above.
- 2026-11-15 – Red: `@wip` off the 7 `@task:119` scenarios (8 runs), new menu steps in `layout.steps.ts`; the header steps now look outside `<main>` (the menu frame) and the nav steps at the visible `Dashboard` nav. All 8 fail on the missing menu (no `aria-current`, no role badge, no "Open menu" button, content not beside the menu); the affected feature files otherwise pass.
- 2026-11-15 – Green (lane 2): `currentNavItem` and `initials` (unit), `Sheet`, `SidebarLink`, `SidebarPanel`, `Sidebar` and `SidebarDrawer` (component), `SidebarNav` (component, `usePathname` mocked). `packages/ui`: `sheet`, `sidebar`, `sidebar-drawer`, `icons` (lucide); new pinned deps `@radix-ui/react-dialog` 1.3.1, `lucide-react` 1.73.0. Dashboard: `AppFrame` → `AppSidebar` (server: theme, locale, messages) → `SidebarMenu` (stories) with `SidebarNav` the only client part; the 27 pages switched, `app-header.tsx` removed. Inside the menu `sidebarSurface` points the shared tokens (`--background`, `--muted-foreground`, `--secondary`, `--border`, `--ring`, …) at the `--sidebar-*` ones, so `LanguageSwitch`, `ThemeToggle` and `SignOutButton` render on the charcoal surface without changes. The `--sidebar-*`, `--card` and `--accent` tokens come from task 118 (lane 1): until this branch is rebased on it the menu renders uncolored. `@task:119`: 8/8 on warm dev servers (the first scenario timed out twice on cold dev compiles of `/projects/new` and the project page under the loaded machine, 13 s and 9 s; not a flake in the steps). The 8 feature files that use the changed steps (authentication, home-and-menu, language, partners, partner-access, soft-delete, workspace-switching, zone-navigation, plus dashboard-home by name match): 72 passed and 9 timed out at 30 s at the end of the run with the machine at load average ~32 (lane 1 running e2e too); partners, soft-delete and workspace-switching then passed 24/24 on their own. `pnpm test` 8/8 packages (dashboard 498, ui 70), `pnpm lint` and `pnpm typecheck` clean, `build-storybook` builds. Stories: `Components/Sheet` (closed, open, dark, right to left, Escape), `Components/Sidebar` (light, dark, right to left, in another workspace, links current and hover, focus, phone drawer closed and open in light, dark and right to left, open and close), `Dashboard/SidebarMenu` (admin, partner, another workspace, no name, dark, right to left). Remaining for QA after the rebase on 118: full `pnpm test:e2e`, the a11y addon check on the colored menu, `screenshots` and `flow-guide`.
- 2026-11-15 – Leak scenarios added to `home-and-menu.feature` at the access-auditor's request (no `@wip`): a worker's menu and a partner's phone menu have no Customers; on a project from another workspace the menu shows that workspace and "in another workspace", not my "Admin" role from the current one.
- 2026-11-15 – Review fixes: the switcher hides my role on a record from another workspace (it is my role in the current one, so it mislabelled the record's workspace; `sidebar-menu.test.tsx`); the menu landmark and the drawer are named by the new `menu.label` ("Menu" / "תפריט") instead of the workspace name; the drawer stays open on Ctrl/Cmd/Shift/Alt-click and middle click (a new tab or window); `lucide-react` pinned to 1.72.0 (1.73.0 was inside the 3-day release wait, SUP-1); register: SEC-19 note on the drawer's runtime `<style>` tags (WEB-1) and SEC-54 (hand-added dependencies skip the release wait). Each of these went red first. The planner's leak scenario "On a page from another workspace the menu doesn't show my role from the current one" (575b9e0) came in after the fix was written: with the guard taken out again it failed twice, `And the header does not say "Admin"` → `getByText('Admin').and(locator(':not(main *)')).visible()` expected 0, received 1; with the guard back, home-and-menu and zone-navigation passed 16/16, all 11 `@task:119` runs included. `pnpm test` 8/8 packages (dashboard 501, ui 71), lint, typecheck and `build-storybook` clean.
- 2026-11-15 – Note on history (review should-fix 2): in the first green pass the unit and component tests (`currentNavItem`, `initials`, `Sheet`, the Sidebar parts, `SidebarNav`) were written first and run red in the lane before each implementation, but they were committed together with their implementation in the `feat(ui)` and `feat(dashboard)` commits, not as separate red commits. The red runs are in the session, not in git history. Left as is rather than rewriting history.
- 2026-11-15 – QA (lane 2, rebased on 118): lint, typecheck, build, 779 unit tests, Storybook + axe (22 stories, 0 violations, light/dark/RTL) pass; full e2e 344/352 with 2 workers, the 8 failures (readings, workspaces, workspace switching, members; none in the menu) passed alone with 1 worker (load); flow-guide 26/26; screenshots 37/43 (the 6 failures are the stale script, parked). Desktop, dark, Hebrew and phone drawer checked by eye.

## Parking lot
- An icon-only collapse on desktop.
- My tasks, Forms, Partners and Members in the menu (with the retired `@task:031` My tasks scenario, task 070's parking lot).
- A global Find box across the app with a keyboard shortcut.
- A ⋯ account menu (notifications, profile).
- A Vercel-style top context bar on desktop.
- A "Skip to content" link before the menu.
- Rename "header" to "menu" in the step wording of the scenarios listed above (a `docs(features):` commit), once the side menu has settled.
- 2026-11-15: started in lane 2, in parallel with task 118 (lane 1) at the owner's request. Built against the `--sidebar-*` token names fixed in task 118; rebased on main after 118 merges, before QA and screenshots.
- The phone top bar doesn't show the "in another workspace" hint (it is in the drawer's switcher only).
- The drawer stays open when the window is resized past `lg` (it sits behind the side menu until closed).
- Tighten "the header says {string}" to an exact text match (today it matches a substring).
- In Hebrew an English workspace name or email in the menu is cut with the ellipsis at the start (`dir="auto"` on those spans would fix it) (QA, 2026-11-15).
- `e2e/scripts/screenshots.mjs` is stale since the project form gained Site and Stage: its "projects" step no longer creates projects, so 6 task-board shots fail (pre-existing, not task 119) (QA, 2026-11-15).
