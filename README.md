# BeamHaven

**Every project. One place.**

BeamHaven is a self-hosted web app for managing home renovations: properties, projects, rooms, budgets, contractors, materials, schedules, documents and photos, all in one place. It's built for a household to use together, and designed so it could support more households later.

> **Status:** Milestone 1 (local development foundation), in progress. See [`ROADMAP.md`](ROADMAP.md) and [`PROGRESS.md`](PROGRESS.md).

## Technology

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL · Prisma · Better Auth · Docker Compose.
Hosted on a dedicated Ubuntu VM on Proxmox, behind Nginx Proxy Manager. The reasons for each choice are in [`DECISIONS.md`](DECISIONS.md).

## Documentation

| File                                                       | What's in it                                      |
| ---------------------------------------------------------- | ------------------------------------------------- |
| [`ROADMAP.md`](ROADMAP.md)                                 | Milestones, the MVP, and what counts as done      |
| [`PROGRESS.md`](PROGRESS.md)                               | What's finished, what's in progress, test results |
| [`DECISIONS.md`](DECISIONS.md)                             | Why we chose each technology                      |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)                 | Database design                                   |
| [`docs/BUDGET_DEFINITIONS.md`](docs/BUDGET_DEFINITIONS.md) | Exactly what each budget number means             |
| [`docs/UI_DIRECTION.md`](docs/UI_DIRECTION.md)             | Visual style and navigation                       |
| [`DEPLOYMENT.md`](DEPLOYMENT.md)                           | How it runs on the server                         |
| [`DOMAIN_MIGRATION.md`](DOMAIN_MIGRATION.md)               | How to change the web address safely              |
| [`BACKUP_AND_RECOVERY.md`](BACKUP_AND_RECOVERY.md)         | Backups and how to restore them                   |
| [`CLAUDE.md`](CLAUDE.md)                                   | Rules for Claude Code sessions                    |
| [`.env.example`](.env.example)                             | Every setting, with no real secrets               |

## Local development

You need a Mac with Homebrew, Git, Node.js 24 (installed with `fnm`), OrbStack and VS Code. `PROGRESS.md` records how these were installed.

```bash
# 1. Get the code (once)
mkdir -p ~/Developer && cd ~/Developer
gh repo clone yeffo-boop/beamhaven
cd beamhaven

# 2. Create your local settings file (once), then open .env and check it
cp .env.example .env

# 3. Install the project's packages (again whenever package.json changes)
npm install

# 4. Start the app, then open http://localhost:3000
npm run dev
```

Press `Ctrl+C` in Terminal to stop the app.

Before opening a pull request, run all the fast checks with `npm run check`, then `npm run build`.
The same checks run automatically on GitHub for every pull request.
