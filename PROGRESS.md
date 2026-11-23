# Progress Log

Newest entries at the top. Each entry records what was done, which files changed, which tests ran, any open issues, and the next step.

---

## 2026-11-23: Milestone 1, step 1 (project foundation), in review

### Done

- **Mac tools (Jeff):** Homebrew (already installed), Git 2.56.1, Node.js 24.21.0 via `fnm`, npm 11.19.0, GitHub CLI 2.105.0, OrbStack (Docker 29.8.2) and VS Code.
- Created the Next.js 16 project: App Router, TypeScript strict, Tailwind 4, and the `src/` layout from `CLAUDE.md`.
- **Configuration:** `output: "standalone"` for Docker, no `X-Powered-By` header, and basic security headers. The full Content-Security-Policy comes with logins in Milestone 2.
- **Design tokens** (spruce, plaster, ink, and the status colors) for light and dark mode in `src/app/globals.css`, plus the Geist fonts.
- **`src/config/env.ts`:** checks every setting with Zod when the server reads it, and refuses a non-https `APP_URL` in production.
- **`src/lib/url.ts`:** `absoluteUrl()` builds outside links from `APP_URL`, and refuses links that would point at another site.
- **`/api/health`:** a health-check endpoint that runs on every request and is never cached.
- **Tooling:** Prettier (with Tailwind class sorting), Vitest, an `npm run check` script, and a GitHub Actions workflow that runs lint, formatting, type check, tests and build on every pull request.
- A temporary home page, which the app shell replaces in a later step.

### Tests (run in the cloud workspace on Node 22, 2026-11-23)

- `npm run lint`: passed, no warnings.
- `npm run format:check`: passed.
- `npm run typecheck`: passed.
- `npm test`: 7 of 7 passed (`absoluteUrl` and the settings checks).
- `npm run build`: passed. `/api/health` is dynamic; `/` is static.
- Ran the standalone server: `/api/health` returned `200 {"status":"ok"}` with `nosniff`, `X-Frame-Options: DENY` and `no-store`, and no `X-Powered-By`. The page renders correctly in light and dark mode.
- Not yet run on Jeff's Mac. That is his check for this step.

### Known issues

- `npm audit`: 7 moderate findings in the lint tooling, which isn't part of the deployed app. See ADR-016.

### Next step

Run PostgreSQL locally with Docker Compose, add Prisma, and add a database check to `/api/health`.

---

## 2026-11-23: Milestone 0 (Discovery and Architecture), done (merged in PR #1)

### Done

- Gathered environment answers from Jeff:
  - **MacBook:** M4 Pro, 24 GB of memory, no developer tools installed yet.
  - **Proxmox:** ample resources.
  - **Reverse proxy:** Nginx Proxy Manager, on the same Proxmox host, which handles the HTTPS certificates.
  - **DNS:** GoDaddy.
  - **Servers:** each has a fixed IP address.
  - **Backups:** none exist yet.
- Jeff approved the stack: Next.js, TypeScript, Tailwind, shadcn/ui, PostgreSQL, Prisma, Better Auth, Zod, Vitest, Playwright, and pg-boss later.
- Wrote the planning documents: ROADMAP, DECISIONS (ADR-001 to ADR-015), DATA_MODEL, BUDGET_DEFINITIONS, UI_DIRECTION, DEPLOYMENT (overview), DOMAIN_MIGRATION, BACKUP_AND_RECOVERY (strategy), CLAUDE.md, README, `.env.example` and `.gitignore`.

### Files changed

All of the files listed above are new. `README.md` was rewritten.

### Tests

None. There is no code in this milestone.

### Open questions for Jeff

1. ~~UI~~ Answered: spruce accent, shorter navigation approved, laptop and iPad first.
2. **Budget:** when baselining happens, and whether Viewers can see the budget (see `docs/BUDGET_DEFINITIONS.md`).
3. **Before Milestone 2.5:** Nginx Proxy Manager's internal IP and how it's hosted; the staging address; and the off-VM backup destination.
4. **Before Milestone 2:** an email provider (optional; links can be copied by hand until then), and whether the GitHub repository should stay private.

### Next step

Jeff reviews and merges the Milestone 0 pull request. Then we plan **Milestone 1**, starting with installing the developer tools on the MacBook.
