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

## ADR-022: Records, measurements and private photo storage (Milestone 3)

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - **Composite foreign keys** `(id, workspace_id)` on every household table, so the database itself refuses links between households (see `docs/DATA_MODEL.md`). The code still checks first and answers 404.
  - **Measurements** are typed as text (`12' 4 1/2"`, `10ft`, `3.76 m`) and parsed by `src/lib/units.ts` into whole millimetres, with the unit that was typed. They are shown to the nearest ⅛ inch or in metres. Floor and wall areas are worked out when shown and labelled "estimate"; they're never stored.
  - **Photos** go to `POST /api/uploads` (a route handler, not a Server Action: Server Actions accept only 1 MB by default, and the route can refuse an oversized upload before reading it). The route checks the household and role, that the request came from our own address, a rate limit (300 an hour per person), and the size. The type is read from the file's first bytes (JPEG, PNG, WebP, HEIC, AVIF); SVG, HTML and anything else are refused.
  - **Storage:** a `StorageProvider` interface with one implementation, the local disk (`STORAGE_LOCAL_PATH`, a Docker volume on the server). Keys are `<workspaceId>/<random hex>`, never from the file name. Files are written to a temporary name and then renamed, so a half-written file is never served.
  - **Downloads** go through `GET /api/files/<id>`, which answers 404 unless the file belongs to the viewer's household, and sends `nosniff`, a locked-down Content-Security-Policy and a private cache header.
  - Deleting a project or room deletes its photos' records and bytes. The activity history (`activity_events`) is written by the services and never deleted.
- **Why:** the database refusal is a second lock behind the code. Text input for lengths matches how people read a tape measure. Checking file contents, not names, is what stops a disguised script from being served back to a browser. An S3-compatible provider can be added later behind the same interface.

## ADR-023: How the budget is built (Milestone 4)

- **Status:** Accepted (2026-11-23)
- **Decision:**
  - **One source of truth for the math:** `src/server/services/budget-math.ts` holds every formula from `docs/BUDGET_DEFINITIONS.md` as plain functions with no database, each tested, including the worked example step by step. The data layer only gathers the facts per line; totals for a room, category, project or household are always sums of lines.
  - **The database guards the money rules too:** a deferred trigger refuses an expense whose allocations don't add up to its total; triggers refuse changing or deleting transfers and adjustments; CHECK constraints keep amounts' signs right; composite foreign keys keep everything inside one household.
  - **Transfers lock the source line** (`SELECT … FOR UPDATE`) while checking what's available, so two transfers at once can't both overdraw it. Payments lock the expense the same way.
  - **Splitting money** uses the largest-remainder method (`splitByWeights` in `src/lib/money.ts`), so a split is always exact to the cent. Rows left blank on an expense share the rest evenly.
  - **Locking in** is a button (Jeff's choice), not automatic.
  - **Receipts** reuse the Milestone 3 storage. PDFs are accepted for receipts only (detected by their first bytes) and are always sent as downloads.
  - Paid status is calculated from payments rather than stored, so it can never disagree with them.
- **Why:** money mistakes are the costliest kind, so each rule is enforced twice (code and database), and the math is kept in one small, heavily tested file.

## ADR-024: Contractors are vendors with more details (Milestone 5)

**Date:** 2026-11-23. **Status:** accepted.

**Context.** The budget (Milestone 4) already records a "shop or supplier" (a `Vendor`) on commitments and expenses. Contractors need a directory with license, insurance and a log, and their bills need to show up on their page.

**Decision.**

- A `Contractor` row points at one `Vendor`, and the **name lives on the vendor**. Adding a contractor whose name matches an existing shop or supplier takes that record over, so earlier bills appear on the contractor's page. Renaming the contractor renames the vendor. Deleting a contractor keeps the vendor, because bills in the budget still name it.
- Links between records always include the household (composite foreign keys). Optional ones use `RESTRICT`, and the services clear them before deleting the other side, because `SET NULL` on a composite key would also clear `workspace_id`.
- Documents (license, insurance certificate, warranty paperwork) are attachments with purpose `document`: photos or PDFs, checked by their contents like receipts.
- License, insurance and warranty dates show a warning from 30 days before they run out. There are no email reminders yet (no email is set up, ADR-020).

**Consequences.** One place for a contractor's money, with no copying of names. A typo in an old bill's shop name stays a separate vendor until it's corrected there.

## ADR-025: The "Post & Beam" logo

- **Status:** Accepted (2026-11-23)
- **Decision:** the mark is a gable roof resting on one long beam that runs past two posts, drawn on the same 24-unit grid and 2-unit stroke as our Lucide icons, in spruce. In the app it sits on a spruce rounded-square tile (`BrandMark`), and the same drawing makes the favicon, `icon.svg` and the Apple touch icon. The wordmark is the product name in Geist semibold with slightly tight letter spacing, so it still comes from `brand.name` and changes with it. The bare mark is kept in `docs/brand/mark.svg`.
- **Why:** Jeff chose it from four directions (Post & Beam, Callout, Two-bowl B, Fanlight). It reads clearly at 16 pixels and doesn't depend on the name, which is still provisional (ADR-015). The roof, beam and posts tie it to the "Beam" in the name and to timber framing.

## ADR-026: Quotes and contracts share one commitment (Milestone 5)

**Date:** 2026-11-23. **Status:** accepted.

**Context.** A quote that gets approved and then becomes a signed contract is the same money. If each made its own commitment, the budget would count it twice, or someone would have to remember to delete one.

**Decision.**

- Approving a quote creates a commitment (source `quote`) for its latest revision. A contract from that quote **takes the same commitment over** (source `contract`, the contract amount). Deleting the contract hands it back to the quote at the quote's price.
- Change orders are ordinary commitments (source `change_order`) with a link to the contract.
- Contractor payments are expenses linked to those commitments, with an optional stage (deposit, progress, final), and payments against the expenses. No separate payment table.
- The budget's own commitment page refuses to change or delete these commitments and sends people to the quote or contract instead.
- Approving, turning down, reopening a turned-down quote and taking an approval back need `budget:approve`; everything else needs `records:edit`.
- Quote and contract rows are locked (`SELECT … FOR UPDATE`) while they change, so two people deciding at once can't both win.

**Consequences.** The budget formulas in `docs/BUDGET_DEFINITIONS.md` didn't change. A quote can't be repriced once decided; reopen it (or take the approval back) first.

## ADR-027: Room estimates fill in budget estimates, from a reusable price list (Milestone 5, part 3)

**Date:** 2026-11-23. **Status:** accepted. Jeff asked for flooring (price per sq ft, pick the rooms) and paint estimates, and chose to add them, with a price list, sales tax and quote comparison, to Milestone 5.

**Decision.**

- One calculator with four measures (floor, walls, ceiling, around the room), so flooring, tile, paint, ceilings and trim are all the same feature. Presets only fill in the form.
- Prices live on a household **price list** and estimates link to them, so changing a price updates every estimate that uses it.
- An estimate writes only the budget line's **estimate**, never its plan. The plan is still Jeff's decision; the estimate shows up in the forecast until a quote or contract is agreed (`docs/BUDGET_DEFINITIONS.md`).
- Numbers are recalculated when anything they depend on changes, and stored on the budget lines then, rather than worked out each time the budget is read. That keeps the budget's own queries unchanged.
- The arithmetic is a pure module (`src/lib/room-estimate.ts`) with integer millimetres and cents throughout, tested against hand calculations.
- Sales tax is one household rate on materials only. Different rates per item, and tax on labor, can come later if needed.

**Consequences.** Rooms are assumed to be rectangles; anything else gets a typed size. Recalculating on every change is a little more work when saving a room or a price, which is fine at household scale.
