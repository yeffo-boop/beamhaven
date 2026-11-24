# Progress Log

Newest entries at the top. Each entry records what was done, which files changed, which tests ran, any open issues, and the next step.

---

## 2026-11-24: Roadmap updated with the features picked from the competitor review

### Done

- Jeff compared BeamHaven with HomeZada, Houzz, Buildertrend, JobTread and Houzz Pro, and picked what to add (see "Changes agreed on 2026-11-24" in `ROADMAP.md`).
- New **Milestone 12 (Homeowner Extras):** phone install, calendar feed, allowances, punch list, email.
- New **Milestone 13 (Contractor Tools):** client portal, e-signatures, daily job logs, lead tracking.
- Milestone 11 (AI) gains receipt scanning and questions about your project. It still waits on Jeff's approval of the costs.
- The old Milestone 12 (refinement) is now Milestone 14. Online payments and QuickBooks sync are left out for now.

### Next step

Milestone 12, part 1. Email (part 2) will use Resend, which Jeff chose on 2026-11-24.

---

## 2026-11-24: Milestone 10 done: BeamHaven is in production

### Done (on Jeff's VM, as Jeff reported them on 2026-11-24)

- `update.sh` ran, bringing in Milestones 6 to 10.
- Off-site backups to Google Cloud Storage (bucket `beamhaven_backup`). The first encrypted copy succeeded, and Settings → Backups shows it.
- SSH key login set up.
- Reboot test: everything came back healthy by itself.
- Restore test on a temporary VM: `restore-check.sh` passed. Jeff reported it; Claude didn't see the output.
- The test data was wiped, and real data started fresh.

### Next

- Later, not blocking: email for invitations and password resets; images built in GitHub Actions; repeat the restore test every few months.
- Milestone 11 (AI features) needs Jeff's go-ahead and his approval of the costs.

---

## 2026-11-24: Off-site backups can go to Google Cloud Storage

### Done

- Jeff chose Google Cloud Storage for the off-site copies.
- `offsite.sh` now supports `RESTIC_REPOSITORY=gs:<bucket>:/beamhaven`. It signs in with a service account key file, `gcs-key.json`, which sits next to `.env`, is ignored by Git, and is mounted read-only. It also passes `GOOGLE_PROJECT_ID`, and stops with a clear message if the key file is missing.
- `BACKUP_AND_RECOVERY.md` has the Google Cloud console steps: a bucket in the Standard class, and a service account limited to that bucket.

### Tests (cloud workspace, 2026-11-24)

- A missing key file stops with the message and exit code 2.
- With a key file, the container gets `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_PROJECT_ID` and the key, but not the database password.
- **Not tested against real Google Cloud** (no account here). Jeff's first `backup.sh` run is that test.

---

## 2026-11-24: Milestone 10, part 3 (production checklist, restore check, wiping the test data), built

### Done

- **`PRODUCTION_CHECKLIST.md`**: everything that has to be true before real use, in order:
  - health and reboot tests;
  - backups and the off-site copy;
  - a restore test on a temporary VM;
  - wiping the test data;
  - what's left for later.
- **`restore-check.sh`** (ADR-043): checks a restore worked. It checks the health page, counts the main records, shows the newest expense, and checks every uploaded file is on disk. It only reads.
- **`wipe-test-data.sh`**: deletes everything to start fresh. It asks you to type `WIPE`, and keeps a backup in `backups/before-wipe/` first. **Run it only when you're ready.**
- **Fixed in `restore.sh`**: restoring over a running database failed, because of the job queue's partitioned tables. It now recreates the database, and first saves a copy of the current one in `backups/before-restore/`.
- **Fixed in `offsite.sh`**:
  - files restored from off-site belonged to root, so `restore.sh` couldn't read them. restic now runs as your user;
  - a temporary file holding the restic password was left in `/tmp`.

### Tests (cloud workspace, 2026-11-24)

- **Real Docker stack:**
  - The restore check passes with data, and fails when an uploaded file is missing.
  - Typing anything but `WIPE` cancels the wipe.
  - The wipe empties the database and uploads.
  - Restoring the kept backup over the running database brings everything back, and the check passes again.
  - The backup, off-site and restore test from part 1 still passes.
- CI runs the same steps.
- See the pull request for the lint, type check, unit, integration, end-to-end and build results.

### For Jeff to check

Work through `PRODUCTION_CHECKLIST.md` on the VM. Don't run section 5 (the wipe) until you're ready to start using BeamHaven for real.

### Next

Once the checklist is done, Milestone 10 is done. Milestone 11 (AI features) needs Jeff's go-ahead and his approval of the costs.

---

## 2026-11-24: Milestone 10, parts 1 and 2 (backups, health checks, log limits), built

### Done

- **Backups** (ADR-041):
  - keep 7 daily, 4 weekly and 12 monthly copies, and delete older ones;
  - can copy each backup and `.env` off-site, encrypted, with restic (Backblaze B2 or a NAS/USB folder), keeping the same 7/4/12 there;
  - write a status file. Owners see a warning on Home when backups are late or failing, and Settings → Backups shows the last good one.
- **Health and logs** (ADR-042): the worker now has a health check (a heartbeat every 30 seconds), and every container's logs are capped at 100 MB.
- The Docker build step now also accepts the optional proxy certificate (only used on the cloud test machine).
- No database changes.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed.
- Unit: 160 of 160 passed, including the new retention rules (`prune-backups.test.ts`, which runs the real script) and the backup warning rules.
- Integration: 164 of 164 passed.
- End-to-end: 92 passed, 38 skipped on purpose, 0 failed.
- **Real Docker stack** (built images, local test data only): app, db and worker all healthy; two backups in a row, one kept locally; off-site copy made and pruned; the app reads the status file; the newest off-site copy restored and read back as a valid dump. A failed off-site copy is recorded in the status file. CI runs the same check.
- Two bugs found and fixed by that test: an off-site failure skipped the status file, and restic would have kept every off-site copy forever.

### For Jeff to check (on the BeamHaven VM)

`git pull`, then `./scripts/server/update.sh`, then `./scripts/server/backup.sh`, then Settings → Backups. Off-site needs his choice of destination first.

### Next

Part 3: production checklist, a script to wipe the test data (only with Jeff's go-ahead), and the fresh-VM restore test.

---

## 2026-11-24: Milestone 9, part 4 (in-app notifications), built: Milestone 9 done

### Done

- **Notifications** (ADR-040): you now hear in the app when someone else:
  - gives you a task;
  - finishes a task you made or that's yours;
  - approves or turns down a quote you entered;
  - approves something on a design board you started.
- You're never notified about your own actions, and only current household members are notified.
- The **bell** now counts notifications and reminders together and opens a new **Notifications** page with "From your household" and "Reminders". The old Reminders address still works.
- **Database** (one migration, `20261124090000_notifications`): adds a new `notifications` table. It only adds; existing data isn't touched.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed. The migration was applied to the local and test databases.
- Unit: 153 of 153 passed.
- Integration: 164 of 164 passed, including 5 new ones in `tests/integration/notifications.test.ts`: tasks given and reassigned, finished tasks (creator and assignee, not repeated), quotes approved and turned down, board approvals, nothing to yourself, nothing outside the household, only marking your own read, and the database checks.
- End-to-end: full run, 92 passed, 38 skipped on purpose, 0 failed. Updated: the bell opens Notifications, and the old Reminders address still works.

### For Jeff to check

After `update.sh` (it runs the new migration), sign in as another household member, give Jeff a task, then check that Jeff's bell shows it.

### Next

Milestone 9 is done. Milestone 10 (production deployment) needs Jeff's go-ahead.

---

## 2026-11-24: Milestone 9, part 3 (reports and exports), built

### Done

- **Reports** (new, under Library; ADR-039): pick all projects or one, then:
  - download a spreadsheet (CSV) of **budget lines**, **expenses** (with what's paid and still owed, and a project's share) or **tasks**;
  - open a **printable project report**: status and dates, budget, budget by category, milestones, open tasks and expenses. "Print or save as PDF" opens the print dialog; the app's menus are left out of the printout.
- Spreadsheet cells that could run as formulas are made plain text.
- No database changes.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed.
- Unit: 153 of 153 passed, including 4 new ones for the CSV writer (`tests/unit/csv.test.ts`): quoting, formula protection, money as numbers, safe file names.
- Integration: 159 of 159 passed, including 5 new ones in `tests/integration/reports.test.ts`: budget lines, expenses with a project's share, tasks, the printable report's contents, unknown reports, other households' projects, and viewers.
- End-to-end: full run, 92 passed, 38 skipped on purpose, 0 failed. New: download a project's tasks file and check its header; open the printable report and check the menus are hidden when printing; unknown exports are "not found"; the page fits the screen.

### For Jeff to check

After `update.sh`, open Reports, pick a project, download the expenses file and open it in Numbers or Excel. Then open the project report and choose "Save as PDF" from the print dialog.

### Next

Milestone 9, part 4: in-app notifications.

---

## 2026-11-24: Milestone 9, part 2 (search), built

### Done

- **Search** (ADR-038): a Search link at the top of the sidebar, and a magnifying glass in the phone's top bar.
  - It looks through 16 kinds of record by their names and notes: projects, rooms, properties, tasks, milestones, expenses, contractors, quotes, contracts, warranties, materials, orders, appointments, files, design boards and the things on them.
  - Every word you type has to appear, in any order, so "walnut counters" finds the task "Oil the walnut counters".
  - Results are grouped by kind, with where each one belongs (its project, contractor or board).
- No database changes.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed.
- Unit: 149 of 149 passed.
- Integration: 154 of 154 passed, including 5 new ones in `tests/integration/search.test.ts`: matching across kinds and related names, every word needed, empty and odd queries (symbols are plain text), viewers, and never another household's records.
- End-to-end: full run, 85 passed, 36 skipped on purpose, 0 failed. New: find a project by a word and open it; Search from the phone's top bar fits the screen.

### For Jeff to check

After `update.sh`, click Search and look for a word you know is in a project, a contractor or an expense.

### Next

Milestone 9, part 3: the Reports page, with CSV exports and printable reports.

---

## 2026-11-24: Milestone 9, part 1 (Home dashboard and activity feed), built

### Done

- **Home** is now a real dashboard (ADR-037):
  - **Budget**: four numbers and a bar for paid, billed and still expected.
  - **Needs attention**: overdue tasks, bills and deliveries due in the next week, and quotes waiting for a decision.
  - **This week**: what's on the calendar for the next seven days.
  - **Active projects**: each with its budget and next milestone.
  - **Recent activity**, with a link to all of it.
  - Quick buttons to add an expense, a photo or a task.
- **Activity** (`/activity`): the whole household's history, newest first, filtered by kind, with older pages. Events about something that was deleted no longer link to it.
- No database changes.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed.
- Unit: 149 of 149 passed, including 3 new ones for the "needs attention" rules (`tests/unit/dashboard-rules.test.ts`).
- Integration: 149 of 149 passed, including 7 new ones in `tests/integration/dashboard.test.ts`: an empty household; what needs attention, this week and active projects; viewers and other households; feed links, filter and older pages; deleted records losing their link.
- End-to-end: full run, 83 passed, 32 skipped on purpose, 0 failed. New: an overdue task shows on Home and opens; the activity filter; Home and Activity fit the screen.

### For Jeff to check

After `update.sh`, open Home. You should see your projects, anything overdue, and the latest changes. Click "All activity" and try the filter.

### Next

Milestone 9, part 2: search across everything you can see.

---

## 2026-11-24: Milestone 8, part 3 (progress photos), built: Milestone 8 done

### Done

- **Database** (one migration, `20261124080000_photo_phases`): two optional columns on photo attachments, the phase and the day taken. It only adds columns, and existing photos show as "not sorted".
- **Projects and rooms**: photos are grouped into Before, During, After and Not sorted, oldest first.
  - When adding photos, you can pick a **Stage for new photos**.
  - Each photo's **Details** sets its caption, stage and the day it was taken.
- **Before and after**: once there's a before photo and an after photo, a comparison appears. It shows the before photo over the after photo, with a slider to wipe between them, and pickers to choose which two to compare (ADR-036).
- Photo uploads now also accept a phase and a day. The upload route checks them and refuses anything else with a clear message.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed.
- Unit: 146 of 146 passed.
- Integration: 142 of 142 passed, including 5 new ones in `tests/integration/progress-photos.test.ts`:
  - the phase and day on upload, and changed later;
  - an unknown phase or a bad date refused;
  - details only on that record's photos (not a document, not through another record);
  - viewers;
  - other households getting "not found".
- End-to-end: full run, 79 passed, 30 skipped on purpose, 0 failed. New test: upload a before photo, upload another and sort it as after with a caption and day, then see the comparison and move the slider.

### For Jeff to check

After `update.sh`, open a project or room. Add a photo with the stage set to Before, then one set to After, and try the slider.

### Next

Milestone 9 (dashboard and reports) needs Jeff's go-ahead.

---

## 2026-11-24: Milestone 8, part 2 (design boards), built

### Done

- **Database** (one migration, `20261124070000_design_boards`): design boards and board items tables. It only adds tables; no existing data changes.
- **Inspiration page**: your boards as cards, each showing its first items, how many there are and how many are approved. A form to start a board, optionally for a room or project.
- **A board's page**: add an **image** (a photo), a **product** (picture, brand, SKU, link, a tracked material), a **color** (color picker or a typed hex, brand, paint code) or a **finish** (picture and/or color).
  - **Prefer** marks favourites. **Approve** records the final choice with who and when, and the card is outlined.
  - **Reorder** by dragging the handle (mouse or finger), or with the earlier and later arrow buttons.
  - Edit or remove an item, and edit or delete the board.
- **Rooms and projects** show their design boards.
- The upload form code is now shared by Files and boards (`components/forms/use-upload.tsx`).
- Decisions in ADR-035.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed.
- Unit: 146 of 146 passed.
- Integration: 137 of 137 passed, including 10 new ones in `tests/integration/boards.test.ts`:
  - the kinds and their rules;
  - edits keeping the kind;
  - preferred and approved;
  - reordering (including a stale order refused);
  - deleting with pictures;
  - links cleared when a room, project or material is deleted;
  - viewers;
  - other households getting "not found".
- End-to-end: full run, 78 passed, 28 skipped on purpose, 0 failed. New tests: start a board, add a color, an image and a product, move with the buttons, drag to reorder (saved after a reload), prefer, approve, remove, delete. The board pages fit the screen.

### For Jeff to check

After `update.sh`, open Inspiration and start a board. Try dragging an item on the iPad.

### Next

Milestone 8, part 3: progress photos by phase, with a before and after comparison.

---

## 2026-11-24: Milestone 8, part 1 (the document library), built

### Done

- **Database** (one migration, `20261124060000_documents`): documents and document versions tables. It only adds tables; no existing data changes.
- **Files page**: a library of plans, renderings, permits, contracts, manuals, warranties, inspection reports and invoices. Search (names, notes and file names), plus category and project filters. A search also lists matching receipts and documents attached to expenses, contractors, quotes and other records, with a link to each one's record (ADR-034).
- **A document's page**: the current version (photos shown, PDFs as a download), details, every version with who uploaded it and a note, **Upload a new version**, edit, and delete. A version uploaded by mistake can be removed, but not the last one.
- **Projects** have a Documents panel listing the project's documents, with a form to add one.
- Uploads are checked like receipts: a photo or a PDF, read from the contents, within the size limit.

### Tests (cloud workspace, 2026-11-24)

- Lint, formatting and type check: passed. Production build: passed.
- Unit: 146 of 146 passed.
- Integration: 127 of 127 passed, including 12 new ones in `tests/integration/documents.test.ts`: versions and numbering (also for uploads at the same moment), the last-version rule, deleting with files, links cleared when a project, room or contractor goes, search, viewers, and other households getting "not found".
- End-to-end: full run, 74 passed, 26 skipped on purpose, 0 failed (new: add a plan on a project, refuse an HTML file, upload a revision, download, remove a version, find it in Files, delete it; the Files pages fit the screen).

### For Jeff to check

After `update.sh` on the VM, open Files, add a PDF, then upload a second version from its page.

### Next

Milestone 8, part 2: design boards on the Inspiration page.

---

## 2026-11-24: Milestone 7, part 3 (reminders), built: Milestone 7 done

### Done

- **Database** (one migration, `20261124050000_reminders`): a reminders table. It only adds a table; no existing data changes. pg-boss also creates its own `pgboss` schema the first time the worker starts.
- **Worker**: a new `worker` container (same image as `ops`) runs pg-boss and, every 15 minutes, adds reminders that are due: from 7 AM household time, for tomorrow's calendar, and bills due within 3 days. Tasks go to their assignee; the rest to owners and members (ADR-033).
- **In the app**: a bell with an unread count (sidebar and phone top bar) and a Reminders page with Mark read and Mark all read.
- **Server scripts**: `restore.sh` now stops and restarts the worker too; `DEPLOYMENT.md` explains it.
- **Dependency**: `pg-boss` 12.38.1 (installed with `--before=2026-11-09`). `npm audit` reports the same 10 dev-tool advisories as before, nothing from pg-boss.

### Tests (cloud workspace, 2026-11-24)

- Unit: 146 of 146 passed, including 3 new reminder-rule tests (what's due, who gets it, the household's hour).
- Integration: 115 of 115 passed.
- Integration: 4 new tests in `tests/integration/reminders.test.ts` pass: the right people once, waiting for 7 AM in the household's time zone, marking only your own read (and other households untouched), and the worker's context being read-only.
- End-to-end: full run, 70 passed, 24 skipped on purpose, 0 failed (new: the bell opens Reminders; the page fits the screen).
- The worker started locally against the dev database, scheduled its 15-minute job and ran its first pass. CI now also starts it in Docker and waits for that first pass.

### For Jeff to check on the VM

Run `update.sh`, then `docker compose ps` should list `worker` as running and `docker compose logs worker` should say `started` and `added 0 reminder(s)` (or more).

### Next

Milestone 8 (documents and design boards) needs Jeff's go-ahead.

---

## 2026-11-23: Milestone 7, part 2 (the calendar), built

### Done

- **Database** (one migration, `20261124040000_calendar`): an appointments table, an expected date on orders, and a time zone on the household (starting as UTC). It only adds a table and columns; no existing data changes.
- **Appointments and inspections**: what, kind, day, optional start and end times, where, and optional project, room and contractor. Inspections can be marked passed or failed. Each has its own page to edit or delete it.
- **Schedule** now opens on a **month** calendar, with **week**, **agenda** (30 days) and the part 1 **tasks** view. Earlier / Today / Later buttons, and a project filter. On phones the month and week show as a list of busy days.
- The calendar shows appointments, tasks due, milestone targets, deliveries, orders expected (until everything arrives) and unpaid bills by due date (ADR-032).
- Each **project** has a "Coming up" panel with its next four weeks, and a form to add an appointment.
- **Orders** take an optional expected date (not before the order date).
- **Settings** has the household's time zone (owners only), offering the device's zone while it's still UTC.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed. Production build: passed.
- Unit tests: 143 of 143 passed, including 4 new ones for the calendar math.
- Integration tests: 111 of 111 passed.
- Integration tests: 8 new ones in `tests/integration/calendar.test.ts` pass: saving an inspection and its result, time rules, links cleared when a contractor or project is deleted, household isolation, viewers, everything the calendar brings together (and the project filter), the expected date rule, and "today" in the household's time zone.
- End-to-end: new `calendar.spec.ts` (add an inspection on a project, see it coming up, in the week and agenda views, mark it passed, delete it; the month view and Settings fit the screen) passed. Full end-to-end run: 67 passed, 24 skipped on purpose (one full run is enough for the longer flows), 0 failed.

### Next

Part 3: in-app reminders with a pg-boss background worker. That adds a container to the VM, so Jeff will test it there.

---

## 2026-11-23: Milestone 7, part 1 (milestones and tasks that wait on others), built

Jeff gave the go-ahead for Milestone 7 while Milestone 6's last PR was in CI.

### Done

- **Database** (one migration, `20261124030000_milestones_dependencies`): milestones, task dependencies, and a milestone link on tasks. It only adds tables and a column; no existing data changes.
- **Milestones** on each project (a Milestones panel and a page for each): name, target date, notes, and progress worked out from their tasks ("3 of 5 tasks done", Late, Done).
- **Waits on**: a task can wait on other tasks (any project). It shows as **Blocked** until they're done, and can't be marked done before then. Loops are refused, however long (ADR-031).
- **Schedule** (was a placeholder): every milestone and task across projects, filtered by project and by still to do, blocked or done.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 139 of 139 passed. The 4 new ones check the loop finder.
- Integration tests: 103 of 103 passed. The 4 new ones cover milestones and their progress, the project rule, deleting milestones and projects, blocked tasks, loops, household isolation (in the code and in the database) and viewers.
- End-to-end tests: the full run had 61 passed, 22 skipped on purpose and 2 failing: the shell test still expected the Schedule placeholder. After pointing it at a section that's still a placeholder (Files), the shell spec passed on its own (9 passed, 4 skipped). New: plan a project in milestones, make a task wait on another, see it blocked and then unblocked; the Schedule page fits the screen.

### Next

Part 2: the calendar (month, week and agenda) with appointments and inspections, deliveries and payments due.

---

## 2026-11-23: Milestone 6, part 3 (returns and refunds), built: Milestone 6 done

### Done

- **Database** (one migration, `20261124020000_order_returns`): returns and their items. It adds two tables and lets an order's commitment reach $0; no existing data changes.
- **Returns** (on the order page, once the bill is recorded): what went back, item by item (only what has arrived), the date, what the store gave back (blank for the price paid plus its tax; or a typed amount for a restocking fee, refunded shipping, or nothing), and whether the refund has come back yet.
- **Budget**: the refund lowers what the order cost on its lines: committed, spent and the forecast (ADR-030, `docs/BUDGET_DEFINITIONS.md` "Returns").
- **Materials** move to Returned once everything ordered has gone back, and back again if the return is removed.
- The bill and the deliveries stay while anything has been returned; the refund can be opened from the order (for its receipt), but only changed there.

### Tests (cloud workspace, 2026-11-23)

- Lint, formatting and type check: passed.
- Unit tests: 135 of 135 passed. The 4 new ones check the refund math (usual refund, rounding, what's left after a fee, sharing a typed refund).
- Integration tests: 99 of 99 passed. The 4 new ones cover a return and its effect on the budget and the refund, a restocking fee, refunded shipping and a material marked Returned (and back), the rules (bill first, only what arrived, nothing back), household isolation in the code and the database, and viewers.
- End-to-end tests (full run, with a production build and no secrets set): 59 passed, 20 skipped on purpose. The orders test now also returns two boxes and checks the refund and the budget.

### Next

Milestone 7 (tasks and scheduling), with Jeff's go-ahead. On the VM, `update.sh` applies Milestone 6's three migrations (all only add tables and columns, plus one relaxed check).

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
