# Progress Log

Newest entries at the top. Each entry records what was done, which files changed, which tests ran, any open issues, and the next step.

---

## 2026-11-23: Milestone 2, step 2 (households, roles and isolation tests), in review

### Done

- **Households** (ADR-017, ADR-019): new `workspaces`, `memberships` and `invitations` tables, through Better Auth's organization plugin. In code a household is a general _workspace_, so a contracting company could be one later.
- **Your existing account** gets its own household automatically when the migration runs, named "<your name>'s household", with you as **Owner**. (Renaming it comes with the settings step.)
- **The setup command** now also asks for a household name.
- **Roles:** Owner, Member and Viewer, checked by one function, `can()`. A database check refuses any other role. Only owners can invite or manage people; nobody can create or delete households from the browser.
- **Data layer:** `WorkspaceContext` (renamed from `HouseholdContext`) is created only after checking membership, and every household query filters by it.
- **Settings → Household** shows the household's name, your role and the people in it. Someone signed in but not in any household sees a short explanation instead of the app.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 27 of 27 passed (including every cell of the role table).
- Integration tests: 18 of 18 passed. The new **isolation tests** use two households (plus someone in both) and confirm that:
  - nobody gets a household they don't belong to;
  - each household's own role applies;
  - lists only include the current household's people;
  - Better Auth refuses to show, switch to, or change anything in another household;
  - only owners can invite;
  - nobody can create a household from the browser;
  - the database refuses unknown roles.
    Each refusal test also has a matching "this works in your own household" check, so they can't pass by accident.
- The migration was also tested on a copy of the database with an existing account: it created "Jeff's household" with that account as owner.
- End-to-end tests: 27 passed, 4 skipped on purpose.
- Production build: passed.

### Next step

Jeff pulls the branch, runs `npm run db:migrate`, and checks Settings → Household. Then step 3: invitation and password-reset links.

---

## 2026-11-23: Milestone 2, step 1 (sign-in and sign-out), done (merged in PR #5; Jeff signed in on his Mac)

### Done

- **Better Auth** (ADR-004, ADR-018) with email and password. Public sign-up is switched off, passwords need 12 to 128 characters, and logins last 30 days from the last visit (`SESSION_MAX_AGE_DAYS`).
- **Database:** the first real migration adds `users`, `sessions`, `accounts` and `verifications`.
- **`npm run create-first-account`:** asks for a name, email and password (hidden while typing) and creates the first login. It refuses once any account exists, and explains what to do if the tables haven't been created yet.
- **Sign-in page** at `/sign-in`, which returns you to the page you were going to. Wrong passwords get one message that doesn't reveal whether the email exists. After 3 tries in 10 seconds it asks you to wait.
- **Every app page needs a login:** `src/proxy.ts` redirects quickly when there is no cookie, and the server checks the session in the database before showing any page content.
- **Sign out:** a button at the bottom of the sidebar (laptop and iPad) and in **Settings → Account** (all sizes, including the phone).
- **Settings:** new required `BETTER_AUTH_SECRET` (checked on startup; the app refuses the example value). In production, `http://` is still refused except for `localhost`, which the browser tests use.
- **Tests use their own database** (`beamhaven_test`), created automatically, so they can never wipe your real data.
- **Product direction recorded** (ADR-017 and the end of `ROADMAP.md`): leave room for contracting companies and client portals later.
- New development tool: **tsx**, which runs a TypeScript file directly from Terminal (used by the account command).

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 12 of 12 passed.
- Integration tests: 8 of 8 passed (real PostgreSQL 16). They include: the first account can sign in; a wrong password fails; the command only works once; short passwords are refused; sign-up is off; signing out makes the old cookie useless.
- End-to-end tests: 24 passed, 4 skipped on purpose, at laptop, iPad and phone sizes. They cover the redirect to sign-in and back, the wrong-password message, the rate limit, the missing sign-up, and signing out.
- Production build with no secrets set: passed.
- The account command was also run in a real terminal: the password didn't appear on screen.
- Not yet run on Jeff's Mac.

### Open issues

- Running the account command on the production server is planned for Milestone 2.5 (the Docker image needs to include it).
- `npm audit`: same findings as before (ADR-016), none in the code the app runs.

### Next step

Jeff signs in on his Mac. Then step 2: households, roles and the isolation tests.

---

## 2026-11-23: Milestone 1, step 3 (app shell), done (merged in PR #4)

### Done

- **The app shell** from `docs/UI_DIRECTION.md`:
  - laptop and iPad landscape: the full sidebar with groups;
  - iPad portrait: a 72px icon rail;
  - phone: a top bar, a bottom tab bar (Home, Projects, Budget, Schedule) and a "More" sheet.
- **Navigation:** defined once in `src/config/navigation.ts`, with Lucide icons and the current page highlighted (`aria-current`).
- **Placeholder pages** for every section, each saying which milestone builds it. Settings has a working **Appearance** switch (match device, light or dark), saved per browser and applied before the page paints, so there's no flash.
- **shadcn/ui-style building blocks:** `Button` and `Sheet` (on Radix), the `cn()` helper, and `components.json`. The shadcn website is blocked from the cloud workspace, so these two were written by hand in shadcn's style. Jeff's Mac can use `npx shadcn add` for more.
- **Tailwind color names** now follow shadcn's convention, mapped to the spruce palette.
- **Accessibility:** a "Skip to content" link, labelled navigation landmarks, and 40–48px touch targets.
- **Playwright end-to-end tests** at laptop, iPad-portrait and phone sizes, now also run in CI.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 8 of 8 passed.
- Production build: passed. All pages are static except `/api/health`.
- End-to-end tests: 8 passed. 4 were skipped on purpose (each test only runs at the screen sizes it applies to).
- Screenshots reviewed at laptop (light and dark), iPad portrait and phone sizes.
- Not yet checked on Jeff's Mac or iPad.

### Next step

Jeff reviews the shell on his Mac (and iPad, if he likes). Then we wrap up Milestone 1 and plan Milestone 2 (sign-in and households).

---

## 2026-11-23: Milestone 1, step 2 (local database and Prisma), done (merged in PR #3)

### Done

- **`docker-compose.dev.yml`:** PostgreSQL 18, reachable only from the Mac itself (`127.0.0.1:5432`), with its data kept in a Docker volume.
- **Prisma 7:** `prisma.config.ts` and `prisma/schema.prisma`. There are no tables yet; the first real migration arrives with logins in Milestone 2. The client is generated by `npm install`.
- **`src/server/data/client.ts`:** the single shared database client. **`src/server/data/health.ts`:** a database check that gives up after 2 seconds and returns only generic error messages.
- **`/api/health`:** now reports the database. It returns 200 when the database is reachable, and 503 `degraded` when it isn't.
- **ESLint rule:** blocks database imports outside `src/server/data/` (ADR-007). Confirmed by trying a forbidden import.
- `DATABASE_URL` is now a required, checked setting.
- **Tests:** unit and integration tests are separate groups. Integration tests run against a real PostgreSQL, including a check that query parameters can't inject SQL.
- **CI:** now starts a PostgreSQL 18 service, applies migrations, and runs the integration tests.
- **New scripts:** `db:up`, `db:down`, `db:migrate`, `db:studio`, `test:integration`.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 8 of 8 passed.
- Integration tests: 2 of 2 passed against a local PostgreSQL 16. Docker isn't available in this workspace, so CI runs them against 18. Both correctly fail when the database is unreachable.
- `prisma migrate deploy`: passed ("No pending migrations").
- Production build: passed.
- Ran the built server: `/api/health` returned 200 with the database up and 503 with it down. It also correctly refused to start the database check in production mode with an `http://` APP_URL.
- Not yet run on Jeff's Mac. His check: `npm run db:up`, then open `/api/health`.

### Next step

The app shell: shadcn/ui, the sidebar from `docs/UI_DIRECTION.md`, light and dark mode, and empty pages.

---

## 2026-11-23: Milestone 1, step 1 (project foundation), done (merged in PR #2)

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
