# Project Management Application

Full-stack web app template: Next.js multi-zone, shadcn/ui, Storybook, Playwright (ATDD), Vitest (TDD), GCP, GitHub Actions.

## Start here
- Humans: `docs/PLAN.md` → `docs/WORKFLOW.md`
- Agents: `CLAUDE.md`

## Using the template
- **Scaffold a new project automatically:**
  ```bash
  pnpm scaffold    # interactive setup: sets project name, generates secrets, copies clean files
  # or non-interactively:
  ./scripts/create-project.sh --name "my-app" --dest "../my-app"
  ```
- **Manual setup:**
  1. Fill in `docs/PLAN.md` (goal, non-goals, milestones).
  2. Create the first task from `docs/templates/task.md`.
  3. Write its feature file, then follow the loop in `docs/WORKFLOW.md`.

## Quick start
```bash
bash scripts/setup.sh   # checks and installs the tools, writes .env, pnpm install, database, migrations, chromium
pnpm dev                # shell :3000, example zone :3001, dashboard :3002
pnpm test               # unit/component
pnpm test:e2e           # acceptance (Gherkin)
pnpm storybook          # UI workbench :6006
```
- `scripts/setup.sh` works on macOS, Linux (Codespaces, Cloud Shell) and Windows through WSL2. It asks once before
  installing anything (`--yes` doesn't ask, except before installing Homebrew itself); `--no-install` only checks;
  `--no-docker` and `--skip-browsers` skip those steps. Rerunning it is safe: it never changes an existing `.env`.
- After a restart: `pnpm db:up` starts the database and file storage again.
- Without Docker (Linux sandboxes such as claude.ai/code), `setup.sh` runs Postgres 16 and the file storage emulator
  directly, with their data in `~/.local/share/mng-projects`; after a restart, `bash scripts/setup.sh services` starts
  them again (`--stop` stops them).
- **Windows:** install WSL2 (`wsl --install -d Ubuntu`) and Docker Desktop with WSL integration turned on for that
  distro, then clone and run everything inside WSL. PowerShell and cmd aren't supported.

## Onboarding a new person
- **Developer:** the owner adds them as a GitHub collaborator; they clone the repo and run `bash scripts/setup.sh`.
  Nothing secret is shared (the script generates a local `BETTER_AUTH_SECRET`, ADR-0013) and they need no GCP access:
  previews and deploys run in CI. Claude Code picks up the committed `.claude/` settings and guard; personal
  `~/.claude/` settings and memory stay theirs to set up.
- **GCP admin:** not until the Terraform state bucket's IAM is managed in Terraform (ADR-0013). Then the developer
  steps plus `bash scripts/setup.sh infra` (task 112; details in `infra/README.md`).
- **Leaving:** remove their GitHub access. A former GCP admin: remove them in Terraform and rotate the generated
  secrets (`-replace` on them in a Terraform plan; ADR-0013).

## Layout
`apps/shell` (root zone) · `apps/example-zone` · `apps/dashboard` · `packages/ui` (shadcn + Storybook) · `packages/config` · `packages/testing` · `packages/db` (Drizzle + Postgres) · `packages/auth` (Better Auth) · `scripts/` · `e2e` (Playwright-BDD) · `docs/` (plan, workflow, features, ADRs)

Feature/ADR/task templates live in `docs/templates/`.
