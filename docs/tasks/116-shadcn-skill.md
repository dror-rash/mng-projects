# Task 116: The shadcn agent skill, pinned and without pre-approved commands

- **Status:** in-review
- **Milestone:** unscheduled (agent tooling; owner request 2026-11-14)
- **Zone / package:** `.claude/skills/shadcn/`, `skills-lock.json`
- **Feature file:** none (agent tooling, no product behavior)
- **Depends on:** nothing.

## Why
The owner asked for the shadcn/ui agent skill (`pnpm dlx skills add shadcn/ui`), so agents working on `packages/ui` follow shadcn's component and styling rules and use its CLI to look up docs and diffs. As published, the skill (1) runs `npx shadcn@latest info --json` every time it loads, which downloads and runs whatever the latest CLI is (supply chain, `docs/SECURITY.md` SUP), and (2) pre-approves `Bash(npx shadcn@latest *)` and its pnpm and bun forms, so `shadcn add` from any registry or URL could write code into the repo without a permission prompt.

## Scope
- Install only the `shadcn` skill from `shadcn-ui/ui` (the repo moved from `shadcn/ui`), for Claude Code, at project level, copied (not symlinked): `.claude/skills/shadcn/` and `skills-lock.json`.
- Every `shadcn@latest` in the skill's files becomes `shadcn@4.23.0` (published 2026-10-27, at least two weeks old), including the command the skill runs on load.
- Remove the `allowed-tools` line from `SKILL.md`, so shadcn commands go through the normal permission prompt and the guard.

## Out of scope
- The repo's other skill, `migrate-radix-to-base`: no decision to leave Radix.
- Changing `packages/ui` to the skill's newer components (`Field`, `FieldGroup`, `Spinner`, `Empty`, `InputGroup`) or its form layout. Our conventions in `CLAUDE.md` ("Forms") and `docs/ARCHITECTURE.md` win where they differ; a change goes through its own task.
- Wiring the shadcn MCP server.

## Notes
- `skills-lock.json` keeps the upstream hash, so `skills update` or `skills install` would bring back `@latest` and `allowed-tools`. After any update, pin the version again and remove `allowed-tools` (repeat the two edits above).
- The installer's security checks on 2026-11-14: Gen Safe, Socket 1 alert, Snyk Low Risk. The skill's only script (`scripts/showcase-coverage.mjs`) reads files and prints which components no showcase imports.

## Acceptance criteria
- [x] `.claude/skills/shadcn/` contains no `shadcn@latest` and no `allowed-tools`.
- [x] `pnpm lint && pnpm typecheck` pass.

## Parking lot
- Bump the pinned version together with `components.json` when `packages/ui` next adds or updates shadcn components.

## Log
- 2026-11-14 – Installed and pinned; PR opened.
