# Task 118: The owner's palette on the design tokens (60-30-10)

- **Status:** in-progress
- **Milestone:** M21 Side menu and palette
- **Zone / package:** `packages/ui` (`src/theme.css`, `src/components/stacked-bar.tsx`, `src/components/card.tsx` if needed, a contrast unit test); every zone picks the tokens up (`apps/shell`, `apps/example-zone`, `apps/dashboard`) without code changes there, except where a zone hard-codes a color
- **Feature file:** none. The change is visual only: no page, route, text, role or action changes, so there is no new behavior to write as a scenario. It is checked by a unit test on the token contrasts, Storybook, and the screenshot run in both themes and both languages (see "Test plan"). Every existing scenario must keep passing unchanged.
- **Depends on:** nothing open. Task 119 (side menu) depends on this task.

## Why
The owner approved a new look on 2026-11-15 (design proposal "Waypoint Side Menu", the owner's palette https://coolors.co/palette/f6f7eb-e94f37-393e41). Today the app is grayscale. The palette gives each color one job by the 60-30-10 rule: warm paper for content, charcoal for the frame and text, and a flame accent only where to act.

## Owner decisions (2026-11-15, approved with the proposal)
- **Palette:** paper `#F6F7EB` (60%), charcoal `#393E41` (30%), flame `#E94F37` (10%).
- **Dark side menu:** charcoal is the 30%, so the menu is dark on a light page. The alternative (a paper menu, charcoal for text only) was rejected by the approval.
- **"In progress" moves to amber:** its orange is too close to the new accent. "Overdue" keeps its red, which always comes with a label.
- **Accent as text fails** (3.4:1), so links stay charcoal with an underline, and fills that carry text use a darker accent step `#C73A23`.

## Scope
### Light tokens (`:root` in `packages/ui/src/theme.css`)
| Token | Value | Role |
|---|---|---|
| `--background` | `#F6F7EB` | 60%: the canvas behind every page |
| `--card` (new) | `#FCFCF7` | cards, a lighter tint of the paper |
| `--card-foreground` (new) | `#393E41` | text on cards |
| `--border` | `#E2E3D6` | borders and dividers, a darker tint |
| `--foreground` | `#393E41` | 30%: headings and body text |
| `--muted` | a paper step between `--background` and `--border` (implementer's pick, for hover rows and empty bars) | |
| `--muted-foreground` | `#5E6366` | hints and secondary text |
| `--primary` | `#C73A23` | 10%: fills that carry text (primary buttons, the current menu item) |
| `--primary-foreground` | `#F6F7EB` | text on those fills |
| `--accent` (new) | `#E94F37` | non-text marks only: the W mark, focus marks |
| `--ring` | `#E94F37` | focus marks on paper surfaces |
| `--secondary`, `--secondary-foreground` | a paper step and `#393E41` | |
| `--destructive` | same hue, lightness stepped so error and "Overdue" text reach 4.5:1 on the canvas and on cards (about `oklch(0.56 0.22 27.3)`, `#D8151C`; today's red gives 4.4:1 on the new paper) | |
| `--sidebar` (new) | `#393E41` | the side menu surface and the phone top bar (task 119) |
| `--sidebar-foreground` (new) | `#F6F7EB` | menu labels |
| `--sidebar-muted` (new) | `#B4B8AA` | menu hints (email, role) |
| `--sidebar-border` (new) | `#50565A` | lines inside the menu |
| `--sidebar-accent` (new) | `#C73A23`, with `--sidebar-accent-foreground` `#F6F7EB` | the current menu item |
| `--sidebar-ring` (new) | a lighter accent step, about `#F57055` | focus marks inside the charcoal menu (see "Defaults taken") |

### Dark tokens (`.dark`)
| Token | Value |
|---|---|
| `--background` | `#393E41` (charcoal becomes the canvas) |
| `--card` / `--card-foreground` | `#41474A` / `#F6F7EB` |
| `--border` | `#4F5559` |
| `--foreground` | `#F6F7EB` |
| `--muted-foreground` | `#B4B8AA` |
| `--primary` / `--primary-foreground` | `#C73A23` / `#F6F7EB` (same accent steps) |
| `--accent` | `#E94F37` |
| `--ring` | the lighter accent step, about `#F57055` (see "Defaults taken") |
| `--destructive` | same hue, lighter, so its text reaches 4.5:1 on the canvas and on cards (about `oklch(0.82 0.15 22.2)`, `#FF9A97`; today's dark red gives 3.7:1 and 3.3:1) |
| `--sidebar` | `#26292B` (the menu a step darker than the canvas) |
| `--sidebar-foreground` / `--sidebar-muted` | `#F6F7EB` / `#B4B8AA` |
| `--sidebar-border` | a step between `#26292B` and `#393E41` (implementer's pick) |
| `--sidebar-accent` / `--sidebar-accent-foreground` | `#C73A23` / `#F6F7EB` |
| `--sidebar-ring` | `#E94F37` (3.9:1 on `#26292B`) |

Every new token also gets its `--color-*` line in `@theme inline`, so `bg-card`, `bg-sidebar`, `text-sidebar-foreground`, `ring-sidebar-ring` and so on work as Tailwind classes. `bg-card` is used today (`Card`, the dashboard header) but no `--card` token exists, so cards are transparent: this task defines it.

### Charts
- Chart colors stay as they are, in both themes.
- **"In progress" moves from the orange slot (`--chart-2`) to the amber slot (`--chart-4`)**, so orange-red belongs to the accent alone. "Tasks by status" on the overview reads To do (blue, `chart-1`), In progress (amber, `chart-4`), Done (green, `chart-3`). `StackedBar` colors segments by position today: let a segment name its slot, or change the order of slots it uses (implementer's pick); the legend and tooltip don't change.
- **"Overdue"** keeps the destructive red (stepped as above).
- **The chart track** (`--chart-track`, behind the progress meters) uses the border tint in light (`#E2E3D6`: the blue fill reaches 3.4:1 on it). In dark the border tint would leave the fill at 2.1:1, so the dark track uses the menu step `#26292B` (fill 4.0:1). See "Defaults taken".

### Every zone
The shell's login and sign-up pages, the example zone and the dashboard all import `theme.css`, so they all change. Any color hard-coded in a zone (`bg-white`, `text-gray-*`, hex values) that fights the new tokens is replaced by a token.

## Out of scope
- The side menu itself, its components and the new frame (task 119). This task only adds the `--sidebar-*` tokens; the current top header keeps working on the new colors.
- New chart colors beyond the In progress slot change.
- A new font (task 096).
- Changing any text, page, or behavior.

## Acceptance criteria
Every text pair reaches WCAG AA 4.5:1 (from the approved proposal, plus the pairs the new surfaces add). Each row is checked by the contrast unit test.

| Text | On | Theme | Contrast |
|---|---|---|---|
| [ ] Body text `#393E41` | canvas `#F6F7EB` | light | 10.0:1 |
| [ ] Body text `#393E41` | card `#FCFCF7` | light | 10.5:1 |
| [ ] Muted text `#5E6366` | canvas `#F6F7EB` | light | 5.6:1 |
| [ ] Muted text `#5E6366` | card `#FCFCF7` | light | 5.9:1 |
| [ ] Menu labels `#F6F7EB` | menu `#393E41` | light | 10.0:1 |
| [ ] Menu hints `#B4B8AA` | menu `#393E41` | light | 5.4:1 |
| [ ] Button and current-item text `#F6F7EB` | `#C73A23` | both | 4.8:1 |
| [ ] Body text `#F6F7EB` | canvas `#393E41` | dark | 10.0:1 |
| [ ] Body text `#F6F7EB` | card `#41474A` | dark | 8.7:1 |
| [ ] Muted text `#B4B8AA` | canvas `#393E41` | dark | 5.4:1 |
| [ ] Muted text `#B4B8AA` | card `#41474A` | dark | 4.7:1 |
| [ ] Menu labels `#F6F7EB` | menu `#26292B` | dark | 13.5:1 |
| [ ] Menu hints `#B4B8AA` | menu `#26292B` | dark | 7.2:1 |
| [ ] Error and "Overdue" text (`--destructive`) | canvas and card | both | ≥ 4.5:1 |

Not used as text, recorded so nobody does: `#F6F7EB` on `#E94F37` is 3.4:1 (fails, use `#C73A23`); `#E94F37` as link text on the paper is 3.4:1 (fails, links stay charcoal and underlined).

Non-text marks (WCAG 1.4.11, 3:1), also in the unit test:
- [ ] Focus marks: `--ring` on the canvas and cards, and `--sidebar-ring` on the menu, ≥ 3:1 in both themes (light `#E94F37` on paper 3.4:1; `#F57055` on charcoal about 3.8:1; dark `#E94F37` on `#26292B` 3.9:1).
- [ ] The meter fill (`--chart-1`) on `--chart-track` ≥ 3:1 in both themes.

Visual checks (in the PR, no scenario):
- [ ] "Tasks by status" shows In progress in amber in both themes; Overdue counts stay red.
- [ ] Cards have a visible card background (`bg-card` resolves).
- [ ] Storybook: every existing story renders on the new tokens in light and dark, and the a11y addon shows no new contrast violations.
- [ ] `pnpm --filter @repo/e2e screenshots` run in light and dark, in English and Hebrew (the language cookie), attached to the PR: the login page, the overview, a project, a customer, the members page.
- [ ] Every existing scenario passes unchanged (`pnpm test:e2e`).

## Security notes
No data, roles, pages, actions or access change. CSS tokens and one presentational component only. No security-sensitive paths in `docs/SECURITY.md`; no new dependency. The `access-auditor` and `security-reviewer` don't need to run.

## Approach (brief)
- **Contrast test first (red):** `packages/ui/src/theme-contrast.test.ts` reads `theme.css`, takes each token's value from `:root` and `.dark`, and checks the pairs above with the WCAG relative-luminance formula. It fails on today's grayscale values for the new tokens (they don't exist) and on the destructive red. Writing the palette tokens as hex keeps the test free of an OKLCH converter (implementer's pick; if OKLCH stays, the test converts).
- Then the tokens, then the `StackedBar` slot change (its unit test asserts In progress gets `bg-chart-4`), then a sweep for hard-coded colors in the zones.
- **No ADR:** tokens are one CSS file, easy to change back. The palette and its roles are recorded here and in `docs/ARCHITECTURE.md` (UI conventions: "accent for marks, the darker step for fills with text, links charcoal and underlined").

## Defaults taken (planner, 2026-11-15; the owner can change any)
- **Focus marks on charcoal:** the owner's "same accent steps" for dark would put `#E94F37` focus rings on `#393E41` at 2.9:1, below the 3:1 for focus marks. Focus marks on charcoal surfaces (the light theme's menu, the dark canvas and cards) use a lighter step of the accent, about `#F57055`. The W mark stays `#E94F37`.
- **Destructive red:** same hue, lightness stepped per theme so its text reaches 4.5:1 on the new surfaces (today's light red is 4.4:1 on the paper, the dark one 3.7:1 on charcoal). "Overdue keeps its red" holds: the hue doesn't change.
- **Dark chart track:** the border tint in dark leaves the meter fill at 2.1:1, so the dark track is the menu step `#26292B`. Light uses the border tint as asked.
- **`--muted`, `--secondary`, dark `--sidebar-border`:** in-between steps the proposal didn't name; the implementer picks them and the contrast test covers any text on them.

## Test plan
- **Acceptance:** none new (visual only, see "Feature file"). The full suite must pass unchanged.
- **Unit:** `theme-contrast.test.ts` (every row of "Acceptance criteria", both themes); `stacked-bar.test.tsx` (In progress takes the amber slot; the slots stay in a fixed order).
- **Storybook:** existing stories in light and dark; a "Palette" story (swatches of every token with its role, light and dark) so the owner can review the tokens in one place.
- **Screenshots:** `pnpm --filter @repo/e2e screenshots` in both themes and both languages, in the PR.

## Progress log
- 2026-11-15 – Drafted from the owner-approved design proposal ("Waypoint Side Menu", palette and 60-30-10 roles, contrast table).

## Parking lot
- The example zone and the shell's login page could use the charcoal frame too (a top bar); not asked for.
- A light (paper) side menu as a user choice: rejected for now with the approval.
- Chart slots tuned to the palette (warmer blue and green): only if the owner asks.
- 2026-11-15: started in lane 1, in parallel with task 119 (lane 2).
