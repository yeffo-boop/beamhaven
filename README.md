# BeamHaven

**Every project. One place.**

BeamHaven is a self-hosted web app for managing home renovations: properties, projects, rooms, budgets, contractors, materials, schedules, documents and photos, all in one place. It's built for a household to use together, and designed so it could support more households later.

> **Status:** Milestone 0 (planning). There is no application code yet. See [`ROADMAP.md`](ROADMAP.md) and [`PROGRESS.md`](PROGRESS.md).

## Technology

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL · Prisma · Better Auth · Docker Compose.
Hosted on a dedicated Ubuntu VM on Proxmox, behind Nginx Proxy Manager. The reasons for each choice are in [`DECISIONS.md`](DECISIONS.md).

## Documentation

| File | What's in it |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | Milestones, the MVP, and what counts as done |
| [`PROGRESS.md`](PROGRESS.md) | What's finished, what's in progress, test results |
| [`DECISIONS.md`](DECISIONS.md) | Why we chose each technology |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Database design |
| [`docs/BUDGET_DEFINITIONS.md`](docs/BUDGET_DEFINITIONS.md) | Exactly what each budget number means |
| [`docs/UI_DIRECTION.md`](docs/UI_DIRECTION.md) | Visual style and navigation |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | How it runs on the server |
| [`DOMAIN_MIGRATION.md`](DOMAIN_MIGRATION.md) | How to change the web address safely |
| [`BACKUP_AND_RECOVERY.md`](BACKUP_AND_RECOVERY.md) | Backups and how to restore them |
| [`CLAUDE.md`](CLAUDE.md) | Rules for Claude Code sessions |
| [`.env.example`](.env.example) | Every setting, with no real secrets |

## Local development

Setup instructions get written in Milestone 1, once the project exists. They'll cover installing Homebrew, Git, Node.js, OrbStack and VS Code on the MacBook, step by step.
