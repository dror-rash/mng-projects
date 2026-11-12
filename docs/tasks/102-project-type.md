# Task 102: Project type (work, expert opinion, arbitration)

- **Status:** todo
- **Milestone:** M15 Pipeline and communications
- **Zone / package:** `packages/db`, `apps/dashboard` (`features/projects`), `e2e`
- **Feature file:** `docs/features/project-types.feature` (`@task:102`)
- **Depends on:** task 094; ADR-0012

## Why
Expert opinions and arbitrations (flow step 11) run through the same stages as other work (owner, 2026-11-11), but the office needs to tell them apart.

## Scope
- **Migration (one):** `project.type` text not null default `'work'`, check on (`work`, `expert_opinion`, `arbitration`). No policy change.
- **`features/projects/project-type.ts`:** the list, parse and labels: Work עבודה, Expert opinion חוות דעת, Arbitration בוררות.
- **Forms:** a "Type" select on the new and edit project forms (default Work); copy keeps the type.
- **Project page:** the type shows next to the stage.
- **Projects table:** a "Type" column and filter ("Any type" plus the three).

## Out of scope
- Fields specific to arbitrations (case number, arbitrator, hearing dates): open question 1.
- Different stages per type.

## Acceptance criteria
- [ ] A project can be created as an expert opinion and shows its type. ("A project is an expert opinion")
- [ ] The projects table filters by type. ("The projects table filters by type")
- [ ] A made-up type is refused with "Choose a type". ("A made-up type is refused")

## Security notes
A column on `project` under existing policies; written through the project actions (`requireProjectChange`). The migration has no grants or policies, so no `security-reviewer` unless policies change.

## Approach (brief)
Like task 018 (priority): const list, parser with unit tests, form fields, table column.

## Test plan
- **Acceptance:** `project-types.feature`.
- **Unit:** `project-type.test.ts`, `project-input.test.ts` (type).

## Open questions
1. **What do arbitrations and expert opinions need beyond a type** (case or court number, arbitrator, hearing dates, a fixed opinion template)? *Default:* the type only, until the owner brings an example.

## Progress log
- 2026-11-11 – Drafted with `project-types.feature` (`@wip`).

## Parking lot
- Arbitration case details and hearing dates (with scheduling, M20).
