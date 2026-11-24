# BeamHaven Roadmap

> Every project. One place.

This file lists the planned milestones, what each one depends on, and how we will know it is done.
We work on **one milestone at a time**. Each one starts with a short plan that Jeff approves, and ends with Jeff's review.

Status key: ⬜ not started · 🟨 in progress · ✅ done (Jeff approved)

## How a milestone ends ("Definition of Done")

A milestone is done only when all of these are true:

- The agreed requirements are built, and the screens for them work.
- Server-side validation and authorization are in place for every new operation.
- Database changes have gone through migrations (no hand edits to the database).
- Formatting, lint, TypeScript checks, tests and the production build all pass, and the results are recorded in `PROGRESS.md`.
- No critical errors are known.
- The documentation has been updated.
- Jeff has reviewed and approved the result.

---

## Changes from the original plan

Two changes were made to the original milestone order. Both were approved by Jeff on 2026-11-23.

1. **A staging deployment after Milestone 2 (Milestone 2.5).** Putting a small, throwaway version on the real VM behind Nginx Proxy Manager early proves that the VM, HTTPS, secure cookies and proxy headers all work. Doing it before real data exists means a mistake there costs nothing.
2. **Basic private file storage moves into Milestone 3.** Receipts (Milestone 4) and contractor quotes (Milestone 5) need uploads, so storage cannot wait until Milestone 8. Milestone 8 still covers document organization, versioning, design boards and floor plans.

## The MVP (first useful version)

The MVP is everything through **Milestone 5**, plus Milestone 2.5 and a simple task list pulled forward from Milestone 7.
At that point, the two of us can run a real renovation in BeamHaven: logins, properties, projects, rooms, a budget with expenses and transfers, receipts, contractors with quotes and payments, and a to-do list.
The MVP is not "finished" until **Milestone 10** puts it in production with automated backups and a restore we have actually tested. Milestone 10 can be run straight after Milestone 5 if we want to start using the app before Milestones 6 to 9 are built.

---

## Milestone 0: Discovery and Architecture ✅

**Goal:** agree on what we are building and how, before writing any code.

- Ask about the environment (Mac, Proxmox, reverse proxy, DNS). ✅
- Confirm the technology stack. ✅ (see `DECISIONS.md`)
- Define the MVP (above).
- Draft the database model (`docs/DATA_MODEL.md`).
- Define the budget terms precisely (`docs/BUDGET_DEFINITIONS.md`).
- Set the development conventions (`CLAUDE.md`).
- Write the roadmap and the documentation skeleton.
- Present the UI direction and navigation (`docs/UI_DIRECTION.md`).

**Acceptance:** Jeff approves the documents in the Milestone 0 pull request. No application code is written in this milestone.

## Milestone 1: Local Development Foundation ✅

**Depends on:** Milestone 0.

- Install the tools on the MacBook, step by step: Homebrew, Git, Node.js (LTS), OrbStack (to run Docker containers), VS Code, and GitHub authentication.
- Create the Next.js app (App Router, TypeScript strict mode, `output: "standalone"`).
- Set up Tailwind CSS and shadcn/ui, plus the design tokens from `docs/UI_DIRECTION.md`.
- Run PostgreSQL locally with Docker Compose, and add Prisma with an empty first migration.
- Add ESLint, Prettier, Vitest and Playwright.
- Build the app shell: sidebar, top bar, light and dark mode, and empty pages for each section.
- Add a health-check endpoint (`/api/health`).
- Add GitHub Actions to run lint, type checks, tests and the build on every pull request.

**Acceptance:** `npm run dev` shows the shell on the Mac, every check passes in CI, and Jeff can follow the README to start the app himself.

## Milestone 2: Authentication and Households ✅

**Depends on:** Milestone 1.

- Better Auth with email and password, and secure password hashing.
- No public sign-up. The first account is created by a one-time setup command, and everyone after that joins by invitation.
- Households, memberships and roles (Owner, Member, Viewer).
- Invitation links and password-reset links built from `APP_URL`. Until email is configured, an Owner can copy these links from the app and send them themselves.
- Session expiry, logout, and "log out of all devices".
- Rate limiting on login, reset and invitation endpoints.
- A data-access layer that requires a household for every query.
- **Isolation tests** proving that a user in Household A cannot read or change anything in Household B.
- Basic account settings: profile and password change.

**Acceptance:** both of us can log in; an invitation works from end to end; the isolation tests pass.

## Milestone 2.5: Staging Deployment ✅ (SSH keys still to set up)

**Depends on:** Milestone 2.

- Create the Ubuntu Server VM on Proxmox, guided step by step.
- Harden the VM: SSH keys only, a firewall, automatic security updates.
- Install Docker Engine and Docker Compose.
- Run BeamHaven and PostgreSQL in Docker Compose. The app port only accepts connections from Nginx Proxy Manager's IP.
- Add a proxy host in Nginx Proxy Manager and a DNS record at GoDaddy for the staging address.
- Check HTTPS, secure cookies, proxy headers and upload size limits on the real path.
- Take a first manual backup and test restoring it.

**Acceptance:** we can log in over the public HTTPS URL, and the database port cannot be reached from outside the VM.

## Milestone 3: Properties, Projects, Rooms and File Storage ✅ (merged; check on the VM after updating)

**Depends on:** Milestone 2 (2.5 recommended).

- Properties (one or more per household).
- Renovation projects (several per property), with status and planned and actual dates.
- Rooms and areas with measurements (feet and inches, or metric), with calculated areas clearly labeled as estimates.
- Rooms linked to many projects over time.
- Project and room detail pages.
- **Private file storage:** uploads saved outside the web root and served only after an authorization check. A storage interface allows S3-compatible storage to be added later.
- Photos on properties, projects and rooms.

**Acceptance:** a property with projects and rooms can be created and edited; photos upload and are only visible to members of the household; the tests pass.

## Milestone 4: Budget Management 🟡 (built; check on the VM after updating)

**Depends on:** Milestone 3.

- Budget categories and allocations by project, room and category.
- Estimates, commitments, expenses and payments, as defined in `docs/BUDGET_DEFINITIONS.md`.
- Expenses split across rooms and categories.
- Budget transfers with a reason, a date and an audit history.
- Receipts attached to expenses (uses the Milestone 3 storage).
- A budget overview: budget versus actual, remaining, variance and contingency.
- **Thorough automated tests for every financial calculation.**

**Acceptance:** the numbers match a hand-worked example spreadsheet; transfers preserve the totals; the tests pass.

## Milestone 5: Contractors (MVP Complete) ✅

**Depends on:** Milestone 4.

- A contractor directory, including license and insurance details.
- Quotes, with revisions, approval or rejection, and links to budget items. An approved quote becomes a commitment.
- Contracts and change orders.
- Contractor payments (deposit, progress and final payments), with balances and due dates.
- A communication log (entered by hand).
- Warranties with expiry dates.
- **Simple tasks** (pulled forward from Milestone 7): a task list per project and room, with status, an assignee and a due date.
- **Room-based cost estimates** (added by Jeff, 2026-11-23, as part 3, built): price a material or job per sq ft, per linear ft or per gallon, pick the rooms, and the cost is worked out from each room's floor area, wall area (perimeter × height, less doors and windows), ceiling area or perimeter, with a waste allowance. Flooring and paint come ready-made; odd spaces can take a typed area. A reusable price list, a sales tax rate on materials, and a quote's price compared with your own estimate. The results go into the budget as estimates, labeled as such.

**Acceptance:** the full flow works, from quote to approval to payments, and the budget totals stay correct. Room estimates match a hand calculation in tests.

## Milestone 6: Materials and Orders ✅

**Depends on:** Milestone 4.

- Material records, with the selection statuses from "Considering" to "Installed", plus "Returned" and "Canceled".
- Orders holding several items, partial deliveries, returns and refunds.
- The purchase price saved at the time of purchase, so it stays correct if the store's price changes.
- Product links, photos, specifications and manuals.

Built in three parts: **part 1** materials, **part 2** orders with several items, the price paid, deliveries and the bill, **part 3** returns and refunds. All built.

## Milestone 7: Tasks and Scheduling ✅

**Depends on:** Milestone 5 (simple tasks).

- Milestones, task dependencies (blocking circular dependencies), and a clear "blocked" state.
- Calendar views (month, week and agenda) for tasks, appointments, deliveries, inspections and payment deadlines.
- Reminders, using pg-boss background jobs. In-app reminders come first; email follows once email is set up.

Built in three parts: **part 1** milestones, task dependencies and the Schedule page (built), **part 2** the calendar with appointments and inspections (built), **part 3** in-app reminders from a pg-boss worker (built; email reminders wait for email).

## Milestone 8: Documents and Design Boards ✅

**Depends on:** Milestone 3.

- A central document library with categories, search, filters and versions. ✅ (part 1)
- Design boards with images, products, colors and finishes, plus drag-and-drop ordering. ✅ (part 2)
- Floor plans and renderings (images and PDFs), with versions. ✅ (part 1: library categories)
- Progress photos by phase, with before-and-after comparison. ✅ (part 3)

## Milestone 9: Dashboard and Reports ✅

**Depends on:** Milestones 4 to 8.

- ✅ The consolidated dashboard (part 1, ADR-037).
- ✅ An activity feed (part 1, ADR-037).
- ✅ Search across everything a user is allowed to see (part 2, ADR-038).
- ✅ Financial and project reports, with CSV and PDF exports (part 3, ADR-039).
- ✅ In-app notifications (part 4, ADR-040).

## Milestone 10: Production Deployment 🚧

**Depends on:** Milestone 2.5, and whichever feature milestones we want live.

- Promote the staging setup to production at `https://beamhaven.thehoschak.com`.
- Automated nightly backups with a retention policy, plus a copy outside the VM. ✅ (part 1, ADR-041)
- A **tested restore** onto a fresh VM. Tools built (part 3, ADR-043): `restore-check.sh` and `PRODUCTION_CHECKLIST.md`, section 4. The test itself is Jeff's, on a temporary VM.
- Health checks, log rotation, and containers that restart after a reboot. ✅ built (part 2, ADR-042); the reboot test is Jeff's, on the VM.
- A production readiness checklist. ✅ (`PRODUCTION_CHECKLIST.md`, with `wipe-test-data.sh` for clearing the test data)

## Changes agreed on 2026-11-24

After a look at competing apps (HomeZada, Houzz, Buildertrend, JobTread, Houzz Pro), Jeff picked these additions on 2026-11-24:

- Homeowner features: email alerts and a daily summary, a calendar feed, installing BeamHaven on a phone like an app, allowances, a punch list, receipt scanning and questions about your own project.
- Contractor features: a client portal, e-signatures, daily job logs and lead tracking.
- **Left out for now:** online payments and QuickBooks sync. Also 3D room planners (too big for what they give).

They become a new Milestone 12 (homeowner extras) and Milestone 13 (contractor tools). The old Milestone 12 (refinement) becomes Milestone 14. Milestone 11 still waits on Jeff's approval of the AI costs, so Milestone 12 can be built first.

## Milestone 11: AI Features ⬜

**Depends on:** Milestone 9 and Jeff's approval of the costs.

- Privacy rules and an explicit opt-in.
- A provider abstraction, so the AI service can be swapped later.
- Usage tracking and spending limits.
- First workflows: quote summaries and comparisons, and explanations of renovation terms.
- **Receipt scanning:** a photo of a receipt is read and turned into a draft expense, which a person checks and saves.
- **Questions about your project:** ask in plain English ("how much have we spent on the kitchen?") and get an answer that names the records it came from.
- AI answers only from records the user is allowed to see, are labeled "AI-generated", and need confirmation before any data changes.

## Milestone 12: Homeowner Extras ⬜

**Depends on:** Milestone 10. Jeff approved the features on 2026-11-24.

- **Install on a phone:** a web app manifest and icons, so BeamHaven can be added to the home screen and opens full screen. No offline mode (the data lives on the server).
- **Calendar feed:** each person can turn on a private calendar link (iCal) with appointments, task due dates and milestones, for Apple or Google Calendar. The link can be replaced if it leaks.
- **Allowances:** a budget line can hold an allowance for a selection (for example "tile, $3,000"). Materials picked against it show whether they are under or over, and the budget shows the difference.
- **Punch list:** end-of-project fix items, each with a room, an optional contractor, photos and a status (open, fixed, signed off).
- **Email:** invitations, password resets, notifications and an optional daily summary, sent through Resend (Jeff chose it on 2026-11-24), behind a small mail interface so the service can be swapped. Email stays off until it is set up; copy-the-link keeps working.

**Acceptance:** each feature works on the VM; household isolation tests cover every new record; email can be switched on and off by settings alone.

## Milestone 13: Contractor Tools ⬜

**Depends on:** Milestone 12, and Jeff's go-ahead to start. Builds on ADR-017.

- **Client role and portal:** a company workspace can invite a client who sees only the projects they are given. They see progress, photos, the schedule, chosen documents and what is waiting on them. Internal costs and notes stay hidden.
- **E-signatures:** contracts and change orders can be sent for signature. The signer types their name and agrees; we keep who signed, when, from where, and a fingerprint (hash) of the exact document they signed.
- **Daily job logs:** a dated entry per project with work done, crew on site, weather, problems and photos, optionally shared with the client.
- **Lead tracking:** a simple pipeline of possible jobs (new, contacted, quoted, won, lost) that turns into a project and a client when won.

**Acceptance:** a client can never see another client's project, or internal costs, as proven by isolation tests; a signed document can't be changed afterwards.

## Milestone 14: Refinement and Future Readiness ⬜

- Mobile usability, performance, accessibility and onboarding.
- A security review.
- A review of how ready the app is for multiple households.
- A list of what a commercial release would need. No billing or public sign-up unless Jeff asks for it.

---

## Future direction: small contracting companies (Milestone 13 starts this)

Jeff may later offer BeamHaven to small construction and contracting companies, not only homeowners. A company would create projects and bids, and give each client a portal into their own project. The first contractor tools are planned as Milestone 13. Until then we design so it can be added without a rewrite:

- A "household" is stored as a general **workspace**, which could later be a company.
- All permission checks go through one `can()` function, so a **client** role that only sees one project can be added later.
- Every record stays scoped to its workspace, and records that clients might see later (projects, budgets, files) also link to their project.
- Bids would grow out of the existing quote and budget models rather than being a separate system.
