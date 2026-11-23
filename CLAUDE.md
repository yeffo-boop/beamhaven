# CLAUDE.md: Instructions for Claude Code sessions on BeamHaven

## Read this first, every session

1. Read `PROGRESS.md` (where we are), then `ROADMAP.md` (the current milestone), then the relevant `DECISIONS.md` entries.
2. **Read `AGENTS.md` too.** This project uses Next.js 16, which changed a lot (Cache Components, `connection()`, `proxy.ts`). Its up-to-date docs ship with the package in `node_modules/next/dist/docs/`, so check them before writing Next.js code rather than relying on memory.
3. For data work, read `docs/DATA_MODEL.md`. For anything to do with money, read `docs/BUDGET_DEFINITIONS.md`.
4. Don't start a new milestone, or a large step within one, without Jeff's approval.

## Who you're working with

Jeff is the product owner, and is still learning. That means:

- Explain decisions in plain English. Introduce each new tool briefly: what it is, and why we need it.
- For every command Jeff runs, say **which machine** (MacBook / Proxmox host / BeamHaven VM), **which app** (Terminal, Proxmox web UI, Nginx Proxy Manager UI), **the exact command**, **what success looks like**, and **what to do if it fails**.
- Never assume a command succeeded. Ask Jeff to paste the output.
- Never invent IP addresses, VM IDs, interface names, storage paths or credentials. Ask for them.
- Ask before anything destructive (deleting data, resetting a database, overwriting configuration, destroying a VM). Before any migration that changes existing data, explain the risk and make sure a backup has been taken.
- If you see a better way to do something, explain it. Don't quietly change the plan.

## Architecture in one paragraph

A Next.js (App Router) application in TypeScript strict mode, with Tailwind and shadcn/ui for the interface, PostgreSQL through Prisma, Better Auth for logins (its organization plugin provides households), and Zod for validation. In production it runs in Docker Compose on a dedicated Ubuntu VM on Jeff's Proxmox host, behind Jeff's **existing Nginx Proxy Manager**, with DNS at GoDaddy. See `DECISIONS.md` for the reasons behind each choice.

## Code layout (as it will be from Milestone 1 on)

```
src/
  app/              Pages, layouts, Server Actions, route handlers. Keep these thin.
  components/ui/    shadcn/ui primitives
  components/       Shared app components (MoneyDisplay, StatusBadge, …)
  server/auth/      Session and permission helpers: requireUser(), requireHouseholdRole(), can()
  server/data/      The ONLY place that imports Prisma. Every function takes a HouseholdContext.
  server/services/  Business rules (budget math, transfers, quote approval). Plain TypeScript.
  server/storage/   StorageProvider interface plus its local-disk implementation
  lib/              Pure helpers: money (cents), units (mm ↔ ft/in), dates, absoluteUrl()
  config/           brand.ts, env.ts (reads and validates environment variables with Zod)
prisma/             schema.prisma, migrations/
tests/              unit/, integration/ (real Postgres), e2e/ (Playwright)
docs/               DATA_MODEL.md, BUDGET_DEFINITIONS.md, UI_DIRECTION.md
```

## Rules you must not break

### Security

- **Every protected operation checks authorization on the server.** Hiding a button is not security.
- **Every household-owned query is scoped by `householdId`**, through `src/server/data/`. Never import Prisma anywhere else.
- When a record belongs to another household, respond with **404**, not 403.
- Validate every input with Zod on the server.
- No raw SQL built from strings. Use Prisma, or `$queryRaw` with tagged-template parameters.
- Don't render user content with `dangerouslySetInnerHTML`.
- Uploaded files are stored outside `public/` under random keys, and served only through an authorized route. File types are checked by content, and SVG and HTML are rejected.
- Never commit secrets. Only `.env.example`, with placeholders.
- Login, password reset and invitation endpoints are rate-limited. Public sign-up stays **off**.

### Domain and branding

- **Never hardcode the domain.** Use `absoluteUrl()`, which reads the server-only `APP_URL`.
- **Never use `NEXT_PUBLIC_` for the URL**, or for anything that has to change without a rebuild.
- Product name and logo come from `src/config/brand.ts`. No branding in database values.

### Money and measurements

- Money is always whole cents (`bigint` / `BigInt`). No floats. Use the helpers in `lib/money`.
- Follow `docs/BUDGET_DEFINITIONS.md` exactly. Every change to budget calculations needs tests.
- Measurements are stored as integer millimetres, along with the unit the user typed. Calculated values are labeled as estimates.

### Quality

- TypeScript strict mode, with no `any` unless a comment explains why.
- Small modules. Comments explain the _why_ of anything non-obvious.
- No placeholder logic presented as finished.
- **Never say something is tested unless the tests actually ran.** Report the real command and its output.

## Commands

| Task                                 | Command                                            |
| ------------------------------------ | -------------------------------------------------- |
| Install dependencies                 | `npm install`                                      |
| Run the dev server                   | `npm run dev` (then open http://localhost:3000)    |
| Lint                                 | `npm run lint`                                     |
| Check / fix formatting               | `npm run format:check` / `npm run format`          |
| Type check                           | `npm run typecheck`                                |
| Unit tests                           | `npm test` (or `npm run test:watch` while working) |
| All fast checks at once              | `npm run check`                                    |
| Production build                     | `npm run build`                                    |
| Start the local database (next step) | `docker compose -f docker-compose.dev.yml up -d`   |
| New migration (next step)            | `npx prisma migrate dev --name <what_changed>`     |
| End-to-end tests (later)             | `npm run test:e2e`                                 |

## Next.js 16 rules for this project

- `cacheComponents` is on: data is **dynamic by default**, and we opt in to caching with `"use cache"`.
- Code that reads environment variables or the database while rendering must run at request time. Call `await connection()` (from `next/server`) first, as `src/app/api/health/route.ts` does.
- The Prisma client is generated into `src/generated/prisma` (not committed) by `npm install`. Import it only inside `src/server/data/`; ESLint blocks it anywhere else.
- Read settings only through `getEnv()` in `src/config/env.ts`, never `process.env` directly.

## Adding dependencies

- Keep dependencies few. Explain new ones in the pull request.
- Install with a cut-off date about two weeks back, for example `npm install <pkg> --before=2026-11-09`. Brand-new releases are the most common way malicious packages spread, and they are sometimes broken.
- Run `npm audit` and mention anything it reports.

## Workflow

- Branch per step, then a pull request into `main`. Jeff reviews and merges. CI (lint, typecheck, test, build) must pass.
- Before reporting a step as done: lint, typecheck, run the relevant tests, build, and check the logs for errors.
- At the end of each step, report: what was done, which files changed, the test results, what Jeff should check, any open issues, and the suggested next step. Then update `PROGRESS.md`.
- Record new architectural choices in `DECISIONS.md`.
