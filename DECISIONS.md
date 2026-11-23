# Architecture Decision Log

Each entry records an important technical choice: what we chose, why, the alternatives we considered, and what it costs us.
New decisions get the next number. If a decision is changed later, the old entry stays and gets marked **Superseded by ADR-NNN**.

Statuses: **Proposed** (waiting for Jeff) · **Accepted** · **Superseded**

---

## ADR-001: Next.js (App Router) with TypeScript for the whole application

- **Status:** Accepted (2026-11-23)
- **Decision:** a single Next.js application, using the App Router, serves both the pages and the server logic. TypeScript runs in strict mode.
- **Why:** one language and one codebase is easier for one person to learn and maintain. Server Components and Server Actions mean we rarely need to write a separate API.
- **Alternatives:** a separate React frontend plus an Express or Fastify API (two apps to deploy and keep in sync); Remix or React Router (good, but smaller ecosystem and not Jeff's preference).
- **Tradeoffs:** Next.js changes fairly quickly. We keep business logic out of Next.js-specific files (see ADR-007), so framework upgrades only touch a thin layer.

## ADR-002: PostgreSQL as the only database

- **Status:** Accepted (2026-11-23)
- **Decision:** PostgreSQL holds all structured data. Later it also holds background jobs (ADR-009) and full-text search indexes.
- **Why:** it is reliable, well understood, and handles money (`numeric` and `bigint`), JSON and full-text search. Using one database means one thing to back up.
- **Version:** PostgreSQL 18 (the `postgres:18-alpine` image) locally, in CI and in production, so all three behave the same.
- **Alternatives:** SQLite (simpler, but weaker when several people write at once and harder to scale to multiple households); MySQL (fine, but Postgres has better tooling for what we need).

## ADR-003: Prisma as the ORM

- **Status:** Accepted (2026-11-23)
- **Decision:** Prisma defines the schema, generates type-safe database code, and manages migrations.
- **Why:** the `schema.prisma` file is the easiest way to read the whole data model in one place, which matters while Jeff is learning. Its migration workflow (`prisma migrate dev` / `prisma migrate deploy`) is well documented.
- **Alternatives:** Drizzle (lighter and closer to SQL, with excellent performance, but harder for a beginner to read); Kysely (a query builder only, with no schema management).
- **Prisma 7 specifics:** the client is generated into `src/generated/prisma`, connects through the `@prisma/adapter-pg` driver, and the CLI reads `prisma.config.ts`, which loads `.env` the same way Next.js does.
- **Tradeoffs:** some advanced queries (reports, full-text search) will need raw SQL through `prisma.$queryRaw`, using parameters and never string concatenation.

## ADR-004: Better Auth for authentication

- **Status:** Accepted (2026-11-23)
- **Decision:** Better Auth (self-hosted, running inside our app, with its data in our Postgres database), using:
  - email and password, with secure password hashing;
  - database-backed sessions in HttpOnly, Secure, SameSite=Lax cookies;
  - its `organization` plugin as the base for **households**, memberships and invitations;
  - its built-in rate limiting.
- **Why:** it supports everything we need for the MVP and leaves room for later additions (OAuth, passkeys, two-factor authentication) without changing the data model.
- **Alternatives:** Auth.js / NextAuth (discourages password logins and has no built-in invitations); Lucia (now just a learning resource, no longer a library); a hosted service such as Clerk or Auth0 (not self-hosted, and it costs money).
- **Rules:** public sign-up is **disabled**. Accounts are created only by the first-run setup command or by accepting an invitation.

## ADR-005: Zod for validation

- **Status:** Accepted (2026-11-23)
- **Decision:** every Server Action and route handler checks its input with a Zod schema before doing anything else. The same schemas are reused by the forms in the browser, but **the server check is the one that counts**.

## ADR-006: Tailwind CSS and shadcn/ui for the interface

- **Status:** Accepted (2026-11-23)
- **Decision:** Tailwind for styling; shadcn/ui components (built on Radix primitives, which handle accessibility) copied into `src/components/ui`; Lucide icons throughout.
- **Why:** accessible building blocks we own and can restyle, rather than a heavy component library that dictates our look.

## ADR-007: Code organized in layers, with household scoping enforced in one place

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - `src/app/`: pages and Server Actions only. Kept thin.
  - `src/server/services/`: business rules (for example "transfer budget"). These are plain TypeScript and easy to test.
  - `src/server/data/`: the **only** code that talks to Prisma. Every household function requires a `WorkspaceContext` (the user ID, household ID and role) and filters by `workspaceId`. _(Renamed from `HouseholdContext` / `householdId` in Milestone 2, see ADR-017.)_
  - `src/server/auth/`: functions that check the session and permissions (`requireUser()`, `requireWorkspace()`, `can()`, `assertCan()`).
- **Why:** if a page forgets to check permissions, the data layer still refuses to return another household's data. A lint rule will block importing Prisma anywhere outside `src/server/data/`.
- **Later option:** PostgreSQL Row-Level Security as a second layer of protection, before any commercial launch.

## ADR-008: Money stored as whole cents

- **Status:** Accepted (2026-11-23)
- **Decision:** money is stored as a whole number of cents in `BigInt` columns (for example `amountCents`), with a currency code on the household. All calculations use whole numbers. Converting to dollars happens only for display. Splitting an amount uses a "largest remainder" method so the parts always add back up to the original total exactly.
- **Why:** floating-point numbers can't represent amounts like $0.10 exactly, and the rounding errors build up over many calculations.
- **Alternative:** Postgres `numeric` with a decimal library (also correct, but whole cents are simpler to reason about and test).

## ADR-009: Background jobs only when needed, using pg-boss

- **Status:** Accepted (2026-11-23). Planned for Milestone 7.
- **Decision:** when reminders and email arrive, a separate `worker` container runs pg-boss, which stores its job queue in Postgres.
- **Why:** reliable retries and scheduling without adding Redis or another server.

## ADR-010: Deployment with Docker Compose on a dedicated Ubuntu VM, behind the existing Nginx Proxy Manager

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - A dedicated Ubuntu Server LTS VM on Jeff's Proxmox host.
  - Docker Compose runs three services: `app` (Next.js standalone), `db` (Postgres) and, later, `worker`.
  - The **existing** Nginx Proxy Manager on the same Proxmox host handles HTTPS (Let's Encrypt) and forwards requests to the VM's app port over the internal network.
  - The app port is restricted by the VM firewall (UFW, plus Docker's `DOCKER-USER` chain) to Nginx Proxy Manager's IP. Postgres is never published outside Docker's internal network.
  - DNS is managed at GoDaddy.
- **Why:** uses what Jeff already runs, with no second public proxy.
- **Watch out for:** Docker's published ports bypass UFW by default. We handle this explicitly (see `DEPLOYMENT.md`).

## ADR-011: The public URL is set at runtime, never at build time

- **Status:** Accepted (2026-11-23)
- **Decision:** `APP_URL` is a **server-only** environment variable, read when the app runs. We never use a `NEXT_PUBLIC_` variable for the domain, because Next.js copies those into the browser JavaScript at build time. Any code that needs a full link (invites, password resets, emails, auth callbacks) calls a single helper, `absoluteUrl(path)`. Links inside the app are relative (`/projects/123`).
- **Why:** changing the domain should only mean editing `.env` and restarting, not rebuilding. See `DOMAIN_MIGRATION.md`.

## ADR-012: Uploaded files are private, behind an authorization check

- **Status:** Accepted (2026-11-23). Built in Milestone 3.
- **Decision:** files are saved to a Docker volume outside `public/`, under random IDs (never the user's filename). Downloads go through a route that checks the household and permissions before streaming the file. A `StorageProvider` interface (`put`, `get`, `delete`) has a local-disk implementation now, and can get an S3-compatible one later.
- **Limits:** file types are checked by content, not just by extension; there is a per-file size limit; SVG and HTML are rejected as uploads.

## ADR-013: Testing tools

- **Status:** Accepted (2026-11-23)
- **Decision:** Vitest for unit and integration tests; a real Postgres database in Docker for database and authorization tests (no fake database); Playwright for end-to-end tests; GitHub Actions runs everything on each pull request.

## ADR-014: Git workflow

- **Status:** Accepted (2026-11-23)
- **Decision:** `main` always works. Each step happens on a short-lived branch and is merged through a pull request that Jeff reviews. CI must pass before merging. Releases are tagged `vMAJOR.MINOR.PATCH`, and the VM deploys a specific tag, so rolling back means redeploying the previous tag.

## ADR-015: Branding kept out of the logic

- **Status:** Accepted (2026-11-23)
- **Decision:** the product name, tagline and logo live in a single `src/config/brand.ts` file and a few environment variables. The domain lives only in `APP_URL`. Database records, table names and IDs never contain "BeamHaven" or the domain. The technical identifier `beamhaven` appears only in infrastructure names (the Compose project and the Docker image), which are easy to rename.

## ADR-016: Next.js 16 with Cache Components, and cautious dependency updates

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - Use Next.js 16 as generated by `create-next-app`, with `cacheComponents` and `partialPrefetching` on, which is the framework's recommended setup. Pages are dynamic by default, and we cache deliberately with `"use cache"`.
  - Use Node.js 24 LTS (`.node-version`), which `fnm` and GitHub Actions both read.
  - Install new packages with a cut-off date about two weeks back (`npm install --before=<date>`).
- **Why:** a release that's only days old is where both bugs and supply-chain attacks concentrate. On the first install, a package published a minute earlier was not yet even downloadable.
- **Known issue:** `npm audit` reports 7 moderate findings, all from one denial-of-service bug in `minimatch`, which is pulled in by the ESLint tooling. That code only runs on a developer's machine and in CI, never in the deployed app. We'll pick up the fixed version at the next dependency update once it is two weeks old.

## ADR-017: Leave room for contracting companies and client portals

- **Status:** Accepted (2026-11-23)
- **Context:** Jeff may later market BeamHaven to small construction and contracting companies. They would create projects and bids and give their clients a portal into their project.
- **Decision:** don't build any of it yet, but don't block it:
  - Better Auth's organization is treated as a generic **workspace**. In the interface it is called a household, but nothing in the data assumes a homeowner, and a workspace could later have a type such as `household` or `company`.
  - Permissions stay in one `can(context, action, resource)` function (ADR-007), so a project-scoped **client** role can be added later.
  - Every table stays scoped by workspace (`workspaceId`; in code a household is a _workspace_). Records a client might later see (projects, budget, files, schedule) also carry their `projectId`, so access can be narrowed to one project.
  - Bids should grow out of the quote, commitment and budget models, rather than a parallel system.
- **Not decided:** billing, public sign-up and the client portal's design. Each needs Jeff's go-ahead first.

## ADR-018: How sign-in works

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - The sign-in form sends the email and password from the browser to Better Auth's own endpoint (`/api/auth/sign-in/email`), so its rate limits and cross-site request checks apply. Server Actions that call Better Auth directly skip those checks, so we don't use them for signing in.
  - `src/proxy.ts` redirects visitors who have no login cookie straight to `/sign-in`. That's only for speed: the real check is `requireUser()` on the server, which looks the session up in the database. The page content in the app shell waits behind it.
  - The first account is created by `npm run create-first-account` (run with `tsx`, which runs TypeScript files directly). It refuses to run once any account exists.
  - The client IP used for rate limiting is read only from `X-Real-IP`, and only when `TRUST_PROXY=true`, because Nginx Proxy Manager overwrites that header with the real address, so visitors can't fake it. To check during Milestone 2.5: that NPM sets it.
  - Integration and end-to-end tests use a separate database named `<your database>_test`, which they create and empty themselves. They refuse to empty any database whose name doesn't end in `_test`.
- **Why:** these keep the safety checks in Better Auth's hands, and make it impossible for a test run to wipe the data you use with `npm run dev`.

## ADR-019: Households in the database

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - Better Auth's organization plugin provides households, stored in the `workspaces`, `memberships` and `invitations` tables, with our own roles `owner`, `member` and `viewer` (a database check refuses anything else).
  - Nobody can create a household from the browser. The setup command creates the first one, and the migration gave any existing account (Jeff's) its own household with them as owner.
  - Deleting a household through Better Auth is switched off.
  - Which household someone is working in comes from their session's active household if they still belong to it, otherwise their oldest one. `resolveWorkspaceContext()` is the only code that builds a `WorkspaceContext`, after checking membership.
  - Better Auth's own permission list only covers its endpoints (inviting and managing people: owners only). Rules for BeamHaven's records live in `can()`.
- **Why:** it reuses Better Auth's tested membership and invitation code, while keeping every rule we write in one place and every query scoped by `workspaceId`.

## ADR-020: Invitations, reset links, rate limits and the Content-Security-Policy

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - **Invitations:** an owner creates an invitation in Settings and copies its link (`APP_URL/invite/<id>`) to send by hand. The id is long and random, works once, and expires after 7 days. Inviting the same email again cancels the older link. Accepting creates the account and the membership; someone who already has an account signs in first and then joins.
  - **Password resets without email:** an owner can make a one-time reset link (24 hours) for someone whose only household is theirs. The server admin can make one for anyone with `npm run password-reset-link -- <email>`, for when the only owner is locked out. The token is stored the way Better Auth's own "forgot password" stores it, so Better Auth checks it, uses it up, and signs the person out everywhere.
  - **Rate limits:** Better Auth limits sign-in, password reset and password change to 5 attempts a minute per visitor. Our own actions have a small in-memory limiter: accepting invitations allows 10 per 15 minutes per visitor, and creating links allows 30 an hour per owner. Counts live in memory, which suits a single server and resets on restart.
  - **Content-Security-Policy:** scripts, styles, images, fonts and connections come only from this site, nothing may frame the app, and forms only submit to this site. Inline scripts are allowed (`'unsafe-inline'`).
- **Why `'unsafe-inline'`:** Next.js and our theme script use inline scripts. The strict alternative, a nonce per request, makes every page fully dynamic and loses the instant-loading shell. React escapes everything it displays and we never insert user content as raw HTML, which is the main defence against injected scripts. Revisit if the app ever shows untrusted HTML.
- **Later, with email (an open question):** send invitation and reset links by email, and add a self-service "forgot password" page.

## ADR-021: How the server runs BeamHaven

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - One `Dockerfile` makes two images. `app` holds only Next.js's standalone server (about 340 MB, no build tools or source). `ops` holds the full toolset for migrations and admin commands, and only runs when asked.
  - `docker-compose.yml` runs `db`, then `migrate` (`prisma migrate deploy`, then exits), then `app`, which starts only if the migration succeeded. `db` has no published port. `app` is published only on the VM's LAN address, and the firewall (UFW plus a `DOCKER-USER` rule, because Docker's ports skip UFW) lets only Nginx Proxy Manager connect.
  - For now the VM clones the public GitHub repo and builds the images itself. Milestone 10 moves builds to GitHub Actions with versioned images, for one-step rollbacks.
  - Staging uses the real address, `beamhaven.thehoschak.com`, and becomes production after the test data is wiped.
  - Backups: `scripts/server/backup.sh` (a `pg_dump` plus a tar of uploads, kept 14 days on the VM) and `restore.sh` (asks you to type RESTORE first). Off-site copies wait for Milestone 10, since there is no backup destination yet.
  - CI builds both images and starts the stack on every pull request.
- **Why:** each piece stays small and replaceable. The website image carries nothing it doesn't need. Migrations run before every start. Building on the VM is the simplest thing that works while there's one server.
