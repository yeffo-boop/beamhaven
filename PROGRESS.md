# Progress Log

Newest entries at the top. Each entry records what was done, which files changed, which tests ran, any open issues, and the next step.

---

## 2026-11-23: Milestone 6, part 2 (orders, deliveries and the bill), built

### Done

- **Database** (one migration, `20261124010000_orders`): orders, order items, deliveries and delivery items, plus an order link on commitments and attachments and a commitment link on expense allocations. It only adds tables and columns; no existing data changes.
- **Orders** (on each project and material page, and a list under Materials): the supplier, order number and date, several items (each from the materials list or typed in, with its quantity, the price paid and its budget line), shipping and tax.
- **Budget**: each order commits money on every line it's charged to, with tax and shipping shared by value (ADR-029, `docs/BUDGET_DEFINITIONS.md`).
- **Deliveries**: record what arrived, item by item, over as many deliveries as it takes. Materials move to Ordered, then to Delivered once everything has arrived.
- **The bill**: one click records it as an expense split across the order's lines (optionally paid in full). The order is then locked until the bill is removed.
- Receipts and packing slips can be attached to an order.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 131 of 131 passed. The 4 new ones check order math (the worked example in the budget definitions).
- Integration tests: 95 of 95 passed. The 6 new ones cover saving orders and their commitments, deliveries and material statuses, the bill and the budget totals, the locks, deleting, household isolation and viewers.
- End-to-end tests (full run, with a production build and no secrets set): 59 passed, 20 skipped on purpose. New: placing an order from a material, recording two deliveries and the bill.

### Next

Part 3: returns and refunds. On the VM, `update.sh` will apply the two Milestone 6 migrations (both only add tables and columns).

---

## 2026-11-23: Milestone 6, part 1 (materials), built

Jeff gave the go-ahead for Milestone 6 once Milestone 5 was merged (PR #14), and asked for each part to be merged as it's done.

### Done

- **Database** (one migration, `20261124000000_materials`): a materials table, plus a material link on warranties and on attachments. It only adds a table and columns; no existing data changes.
- **Materials** (the Materials section, and a panel on each project and room page): name, kind, project and room, supplier, brand, model number, SKU, color or finish, product link, quantity and unit, expected price per unit, specifications and notes.
- **Statuses**: Considering, Selected, Ordered, Delivered, Installed, Returned and Canceled, with the date of the last change and an activity log entry for each change.
- **Photos, manuals and spec sheets** on each material (photos or PDFs), and **warranties** that can point to a material.
- The materials list filters by project and status.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 127 of 127 passed. The 4 new ones check reading, writing and pricing quantities.
- Integration tests: 89 of 89 passed. The 7 new ones cover recording a material and its supplier, the form rules, statuses and their dates and log, documents and warranties when a material is deleted, materials outliving their project and room, household isolation (in the code and in the database), and viewers.
- End-to-end tests: the full run had 54 passed, 18 skipped on purpose and 1 failing (the new materials test, a test-wording problem); after fixing the test, the materials spec passed on its own (5 passed, 2 skipped). New: adding a material from a project, changing its status and finding it with the filters; and no sideways scrolling on the materials pages.
- Production build with no secrets set: passed (as part of the end-to-end run).

### Next

Part 2: orders.

---

## 2026-11-23: Milestone 5, part 3 (room estimates, price list, sales tax), built

Jeff asked for flooring estimates (a price per sq ft, pick the rooms), then paint, and said to include the price list, sales tax and quote comparison too.

### Done

- **Database** (one migration, `20261123230000_room_estimates`): a price list, room estimates and their rooms or typed areas, a household sales tax rate, and links from budget lines and quotes to an estimate. It only adds tables and columns; no existing data changes.
- **Price list** (Budget → Price list): items priced per sq ft, m², linear foot or metre, or per gallon or litre with coverage and coats, an optional install price, a waste allowance and whether tax applies. Presets for flooring, tile, wall paint (per gallon or per sq ft), ceiling paint and baseboard.
- **Sales tax** on materials, set once for the household.
- **Room estimates** (on a project's budget page): pick an item and tick the rooms. Each room's floor, wall or ceiling area, or the length around it, is worked out from its size (walls leave out windows and doors, trim leaves out doorways), with waste, tax and install. Paint is bought in whole gallons for all the rooms together. Rooms that aren't rectangles, and spaces like shower walls, can have a size typed in.
- **Into the budget:** the result fills in the estimate on its own budget lines (one per room, or one for the project), material and install on their own categories. It updates by itself when a price, a room's size, the tax rate or the estimate changes (ADR-027).
- **Quote comparison:** a quote can be compared with one of its project's estimates: the difference, and both as a price per sq ft.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 123 of 123 passed. The 9 new ones check floor, wall, ceiling and trim sizes and the flooring, paint, trim and metric prices against hand calculations.
- Integration tests: 82 of 82 passed. The 8 new ones cover flooring into budget lines, updates after price, room, tax and room-choice changes, paint by the gallon with typed sizes, letting go of lines (keeping one with money on it), the price list rules, the quote comparison, household isolation (in the code and in the database), and viewers.
- End-to-end tests: 51 passed, 16 skipped on purpose. New: adding flooring from a preset, the tax rate, a room estimate over two rooms with the exact totals, a typed closet, and the budget lines; and no sideways scrolling on the price list.
- Production build with no secrets set: passed.

### Next

Jeff's review of the three Milestone 5 pull requests, then updating the VM.

---

## 2026-11-23: Milestone 5, part 2 (quotes, contracts, change orders, contractor payments), built

### Done

- **Database** (one migration, `20261123220000_quotes_contracts`): quotes, quote revisions and contracts; change orders as commitments linked to a contract; a payment stage on expenses; documents on quotes and contracts. It only adds tables and columns; no existing data changes.
- **Quotes** (from a contractor's or project's page): every price the contractor sends is kept as a version. Mark as under review, approve onto a budget line of the quote's project (the latest price becomes a commitment), turn down with a reason, reopen, or take an approval back.
- **Contracts**: made from an approved quote (it takes over the quote's place in the budget, so nothing is counted twice, ADR-026) or from scratch with a contractor and a budget line. Signed, start and end dates; documents.
- **Change orders** on a contract: extra work or a credit (a minus amount), on the contract's line or another line of the same project.
- **Contractor payments**: "Add a bill" on the contract opens a new expense already linked to it, with a payment stage (deposit, progress payment, final payment). The contract page shows the contract amount, change orders, total agreed, billed, paid and what's still to pay.
- **The budget stays in step**: a quote's or contract's commitment can only be changed on its own page; the budget's commitment page sends you there.
- Contractor and project pages list their quotes and contracts.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 114 of 114 passed.
- Integration tests: 74 of 74 passed. The 11 new ones cover revisions, approval into the budget, the budget-side lock, taking an approval back, turning down and reopening, a contract taking over the quote's commitment (budget totals checked line by line), change orders including a credit, staged bills and payments, what can and can't be deleted, contracts without a quote, household isolation (in the code and in the database), and viewers.
- End-to-end tests: 47 passed, 14 skipped on purpose. New: the whole journey from a quote, a revised price and approval, to a contract, a change order and a deposit bill; and no sideways scrolling on quote and contract pages at laptop, iPad and phone sizes.
- Production build with no secrets set: passed.

### Next

Part 3 (Jeff, 2026-11-23): room-based cost estimates for flooring, paint and trim, typed areas for odd spaces, a price list, sales tax on materials, and a quote compared with your own estimate.

---

## 2026-11-23: Milestone 5, part 1 (contractor directory, log, warranties, tasks), built

Jeff approved Milestone 5. It comes in two parts; part 2 (quotes, contracts, change orders and contractor payments) follows.

### Done

- **Database** (one migration, `20261123210000_contractors`): contractors, contractors on projects, a communication log, warranties and simple tasks, plus documents on contractors and warranties. It only adds tables and columns; no existing data changes.
- **Contractor directory** (Contractors in the menu): contact details, trade, license and insurance with expiry dates, and a status (prospect, active, worked with before, do not use). A warning shows from 30 days before a license or insurance runs out, and once it has.
- **Linked to the budget:** a contractor is the same record as the budget's "shop or supplier" (ADR-024), so bills already recorded under that name appear on their page under "Agreed and billed".
- **Communication log:** calls, emails, texts, meetings and notes, optionally about a project.
- **Warranties** on a contractor, project or room, with an expiry warning and their own documents.
- **Simple tasks** on projects and rooms, assigned to a household member or a contractor, with a due date, priority, and Mark done.
- **Documents** (license, insurance certificate and the like): photos or PDFs, checked by their contents.
- **Deleting** a project, room or contractor keeps the related warranties and tasks where they still belong, and removes the ones that belonged only to it.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 114 of 114 passed.
- Integration tests: 63 of 63 passed. The 9 new ones cover the directory, the link to the budget's vendors, the log, warranties and documents, tasks and assignees, what happens on delete, household isolation (in the code and in the database), and viewers.
- End-to-end tests: 43 passed, 12 skipped on purpose. New: adding a contractor (with a typo explained), putting them on a project, logging a call, a task marked done, a warranty with a PDF, and the insurance warning; and no sideways scrolling at laptop, iPad and phone sizes.
- Production build with no secrets set: passed.

### Next

Part 2: quotes with revisions, approval into the budget, contracts, change orders and contractor payments.

---

## 2026-11-23: Milestone 4 (budget), built

Jeff approved Milestone 4, chose a "Lock in budget" button for fixing the original budget, and asked for the pull request to be merged once everything passes.

### Done

- **Database** (one migration, `20261123200113_budget`): budget categories, budget lines, adjustments, transfers, shops and suppliers, commitments (quotes, contracts, change orders), expenses split across lines, payments and refunds, plus receipts on expenses. It only adds tables and columns; no existing data changes. The database itself refuses an expense whose split doesn't add up, a change to transfer or adjustment history, and links between households.
- **Money** is stored as whole cents everywhere and typed the way people write it (`$18,500`, `(250.00)`).
- **Budget math** follows `docs/BUDGET_DEFINITIONS.md` exactly: original, current, estimate, committed, not yet billed, spent, paid, unpaid, forecast, available and variance. `docs/budget-worked-example.csv` works the example by hand, and a test checks the app gets the same numbers.
- **Lock in:** while a project is planning, planned amounts can change. Once someone with approval rights locks it in, the original budget is fixed and changes go through adjustments or transfers, each with a reason. Projects marked In progress show a reminder to lock in.
- **Pages:** the household Budget page (every project, recent expenses, categories), each project's budget (by line, category and room, with history), each line (commitments, expenses, transfers), and expenses (split across lines, tax and shipping, payments, refunds and returns, receipts as photos or PDFs).
- **Safety:** a project or room with money recorded against it can't be deleted; the page explains why. Viewers can see the budget but not change it.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 114 of 114 passed (new: 29 for money, 18 for budget math).
- Integration tests: 54 of 54 passed. The 16 new ones cover the worked example and spreadsheet check, lock-in, adjustment and transfer rules, refusing to overdraw without "Allow going over", reversing a transfer, the database refusing unbalanced splits and history changes, refunds, receipts, household isolation (household A can't see or touch household B's budget, by code or by database), and viewers.
- End-to-end tests: 37 passed, 10 skipped on purpose, and 2 failed: the navigation test still expected the "Coming in Milestone 4" placeholder on Budget. I changed it to check the Schedule placeholder instead and re-ran just that test at laptop and iPad sizes: passed. New: one full run of plan → lock in → contract → deposit → payment → receipt → change order → transfer → household totals, and no sideways scrolling on the Budget page.
- Production build with no secrets set: passed.
- `npm audit`: 10 known issues (7 moderate, 3 high) in development tools, the same as before. No dependencies were added or changed.

### What Jeff should check

On the VM: `git pull`, then `./scripts/server/update.sh` (it takes a backup first). Then open a project, Open budget, add a couple of lines, lock it in, and record an expense with a receipt.

### Next

Milestone 5 (contractors and quotes), with Jeff's go-ahead.

---

## 2026-11-23: Milestone 3 (properties, projects, rooms and photos), built, waiting for Jeff to check

Jeff approved Milestone 3 and confirmed step 9 of DEPLOYMENT.md (backup and restore test) is done, so Milestone 2.5 is complete apart from the SSH key (reminder set for 2026-11-24).

### Done

- **Database** (one migration, `20261123192557_properties_projects_rooms_files`): properties, projects, rooms, project–room links, windows and doors, files, attachments and activity history, plus the household's measurement choice. It only adds tables and one column with a default; no existing data changes. Links between households are refused by the database itself (ADR-022).
- **Measurements:** type lengths the way you'd read a tape (`12' 4 1/2"`, `10ft`, `3.76 m`). They're stored in millimetres and shown in feet and inches or metric (Settings → Properties). Floor and wall areas are labelled estimates; windows and doors come off the wall area.
- **Pages:** Projects (list, new, detail, edit, delete), Rooms (list, new, detail with size and estimates, windows and doors, edit, delete), and a property page. A project can include several rooms, each with its planned work. The first time, Projects and Rooms ask for your home's name and city.
- **Photos** on properties, projects and rooms: stored privately outside the website folder under random names, checked by their contents (SVG and HTML refused), and shown only to the household. Anyone else gets a plain 404.
- **Recent activity** on each project and room.
- **Forms keep what you typed** when something needs fixing.
- **`scripts/server/update.sh`:** one command on the VM to back up, download the newest version and restart (DEPLOYMENT.md, "Updating BeamHaven").

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 67 of 67 passed (new: 36 for measurements, 2 for the photo type check).
- Integration tests: 38 of 38 passed. The 11 new isolation tests show household A can't see, change, delete, link to, or upload onto household B's properties, projects, rooms, windows or photos; that the database refuses cross-household links even without the code's checks; that viewers can look but not change; and that deleting removes the stored files.
- End-to-end tests: 35 passed, 8 skipped on purpose. New: one full run of room → measurements → a typo explained → a window → a project with a date error → linking the room → a photo that a signed-out visitor can't open → a disguised SVG refused → activity; and no sideways scrolling at laptop, iPad and phone sizes.
- Production build with no secrets set: passed.
- Not yet run on the VM. `update.sh` hasn't run on Ubuntu yet; it's checked when Jeff updates.

### Next

Jeff updates the VM with `update.sh` and tries it out. Then Milestone 4 (budget), with his go-ahead.

---

## 2026-11-23: Milestone 2.5 (staging on Proxmox), live on the VM

Jeff reported on 2026-11-23 that the VM is running and the DEPLOYMENT.md step 8 checks all passed. These include HTTPS, sign-in, the secure cookie, the app port open only to Nginx Proxy Manager, and the database port closed. The setup script ran with `--skip-ssh`, because Jeff wasn't home to set up a key.

Still to do: confirm step 9 (a backup, a test restore and the nightly cron job), and set up the SSH key, then re-run setup without `--skip-ssh`.

---

## 2026-11-23: Milestone 2.5 (staging on Proxmox), files ready

### Done

- `Dockerfile` with two images: `app` (the website, 339 MB) and `ops` (migrations and admin commands). `docker-compose.yml` runs `db`, then `migrate`, then `app`; the database has no published port (ADR-021).
- `.env.server.example`, the settings file for the VM.
- `scripts/server/setup-vm.sh`: updates and automatic security updates, Docker, the firewall (SSH from 10.0.0.x; port 3000 only from Nginx Proxy Manager at 10.0.0.134, including Docker's own rules), and SSH keys only.
- `scripts/server/backup.sh` and `restore.sh`, plus a nightly cron line.
- `DEPLOYMENT.md` rewritten as step-by-step instructions; `BACKUP_AND_RECOVERY.md` updated.
- CI now builds both images, starts the stack and checks health and that the database port is closed.

### Tests (cloud workspace, Docker 29, 2026-11-23)

- Both images built. The stack started: `migrate` applied both migrations and exited 0, `app` and `db` were healthy, `/api/health` said ok, and the CSP header was sent.
- `ops` commands worked in the container: `create-first-account`, then sign-in through the API (200, 30-day cookie), then `password-reset-link`.
- The database port was not published.
- Backup, then changing the data, then a restore: the household name and uploads came back. Typing anything other than RESTORE cancelled without changes.
- The `DOCKER-USER` firewall rule, applied with iptables: connections from another address were blocked and the allowed address got through. Loading it through UFW on Ubuntu is checked on the real VM.
- Lint, formatting and type check: passed. No app code changed, so the unit, integration and e2e tests weren't re-run (they passed on the same code in PR #7).

### Not yet tested

`setup-vm.sh` as a whole, Nginx Proxy Manager and HTTPS. These need the real VM (DEPLOYMENT.md steps 1 to 9).

### Next

Jeff creates the VM (steps 1 to 4), and then we run steps 5 to 9 together.

---

## 2026-11-23: Milestone 2, steps 3 and 4 (invitations, resets, account settings, security), done (merged in PR #7; Jeff checked on his Mac)

Jeff asked to batch the remaining steps and test once at the end of the milestone.

### Done

- **Invitations** (ADR-020): owners create a link in Settings → Household, choosing Owner, Member or Viewer, and copy it to send. The `/invite/…` page lets a new person pick a name and password and join; someone with an account signs in and joins. Links work once, last 7 days, and can be cancelled. Used, cancelled, expired and made-up links all show the same "doesn't work" page.
- **Managing people** (owners): change someone's role, remove them (with a confirm step), and make a **password-reset link** for them. Owners can't change or remove themselves, so a household always keeps an owner.
- **Password resets:** `/reset-password` page; resetting signs that person out everywhere. Admin command: `npm run password-reset-link -- <email>`. The sign-in page now explains how to get a reset link.
- **Account settings:** change your name, change your password (signs out other devices), **sign out of every device**, and (owners) rename the household.
- **Rate limits:** sign-in, reset and password change are 5 a minute per visitor; accepting invitations 10 per 15 minutes; making links 30 an hour per owner.
- **Content-Security-Policy** header on every page (ADR-020).

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 29 of 29 passed.
- Integration tests: 27 of 27 passed. New ones cover:
  - invitations: the link is built from APP_URL; a link works only once; cancelled, expired and made-up links are refused; only owners can invite or cancel, and only in their own household; an existing account joins only as the invited email;
  - reset links: they work once and sign the person out; members can't make them; owners can't make them for outsiders or for someone who also belongs to another household.
- End-to-end tests: 31 passed, 6 skipped on purpose. They include one full run of: invite → join → used link refused → reset link → new password → change password → sign out everywhere → remove; plus a check that the CSP header is sent.
- Production build with no secrets set: passed.
- Screenshots of Settings checked at laptop and phone sizes.

### Next step

Milestone 2 is complete. Next is Milestone 2.5 (a staging copy on the Proxmox VM behind Nginx Proxy Manager), which needs Jeff's go-ahead.

---

## 2026-11-23: Milestone 2, step 2 (households, roles and isolation tests), done (merged in PR #6; Jeff checked Settings)

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
