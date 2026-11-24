# Backup and Recovery

**Status (Milestone 10, part 1, ADR-041):**

- Nightly backups with a 7 daily, 4 weekly and 12 monthly retention.
- An optional encrypted off-site copy.
- A warning for owners when backups stop working.

These were tested in Docker here and in CI. Production isn't done until a restore has been tested on a fresh VM (`PRODUCTION_CHECKLIST.md`, section 4).

## What runs

- **Every night at 2:00 AM** (the cron job from `DEPLOYMENT.md` step 9), and **before every update**, `scripts/server/backup.sh`:
  1. writes a database dump and a copy of the uploaded files to `/opt/beamhaven/backups`;
  2. checks the dump can be read;
  3. keeps the newest backup of each of the last **7 days**, **4 weeks** and **12 months**, and deletes the rest (`prune-backups.sh`);
  4. if off-site is set up (Google Cloud Storage, Backblaze B2, or a NAS/USB folder), copies the new backup and `.env` there, **encrypted**, and keeps the same 7/4/12 there;
  5. writes `backups/status/last-backup.json`.
- **BeamHaven reads that status file.** Owners see a warning on Home if:
  - the last good backup is more than **48 hours** old;
  - a backup failed;
  - no backup has ever finished.

  Settings → Backups shows when the last good one was, and whether there's an off-site copy.

## What's backed up

| What                    | Why                                         | How                                                                                               |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **PostgreSQL database** | All your records, including the job queue   | `pg_dump -Fc` inside the `db` container: a consistent snapshot, even while the app is running.    |
| **Uploaded files**      | Receipts, photos, contracts, documents      | A `.tar.gz` of the `uploads` volume.                                                              |
| **`.env`**              | The secrets and settings needed to start up | In the off-site copy only (encrypted). Also keep it in your password manager.                     |
| **The code**            | How to rebuild the app                      | GitHub. `update.sh` prints the version it moved from, so you can go back to it (`DEPLOYMENT.md`). |

**Why not just Proxmox snapshots?** A snapshot taken while PostgreSQL is writing can capture a half-written database, and snapshots usually live on the same disk as the VM. They're a good extra right before a big change, but they're **not** the database backup.

## Off-site copies

Off-site copies use **restic**, a widely used backup tool. It encrypts everything on the VM before sending it. It also only sends what changed, so the nightly upload stays small. It runs in a short-lived container (`restic/restic`), so nothing extra is installed on the VM. `scripts/server/offsite.sh` runs it with the settings from `.env`.

**Setting it up (once):**

1. Pick where the copies go, and fill in `.env` (see `.env.server.example`):
   - **Google Cloud Storage:** follow "Setting up Google Cloud Storage" below. Then set `RESTIC_REPOSITORY=gs:<bucket>:/beamhaven` and `GOOGLE_PROJECT_ID=<project ID>`, and put the key file at `/opt/beamhaven/gcs-key.json`.
   - **Backblaze B2:** create a private bucket and an application key limited to that bucket. Then set `RESTIC_REPOSITORY=b2:<bucket>:beamhaven`, `B2_ACCOUNT_ID` and `B2_ACCOUNT_KEY`.
   - **A NAS share or a USB drive:** mount it on the VM (for example at `/mnt/backup`), so that your user can write to it. Then set `RESTIC_REPOSITORY=/mnt/backup/beamhaven`.
2. Make a password with `openssl rand -base64 32`, put it in `RESTIC_PASSWORD`, and **save it in your password manager**. Without it, the off-site copies can't be opened, by anyone.
3. Run `./scripts/server/backup.sh`. The first time, it creates the repository. Success looks like `Done:` and two file names, and Settings → Backups says there's an off-site copy.

### Setting up Google Cloud Storage

All of this is in the Google Cloud console (console.cloud.google.com) in your browser on the Mac, except the last two steps.

1. **Project:** pick the project at the top of the page, or create one named `beamhaven`. Its **Project ID** is shown on the project's Dashboard; you'll need it for `GOOGLE_PROJECT_ID`.
2. **Bucket:** go to Cloud Storage → Buckets → Create, and choose:
   - a name that's unique across all of Google, for example `beamhaven-backups-<something of yours>`;
   - location type **Region**, for example `us-west1`;
   - storage class **Standard**. Don't use Nearline, Coldline or Archive: they charge extra when files are deleted early, and restic deletes old pieces every night;
   - access control **Uniform**, with "Enforce public access prevention" ticked (the default).
3. **A login just for backups (a "service account"):** go to IAM & Admin → Service Accounts → Create service account. Name it `beamhaven-backup`, and skip the optional "grant access to project" step, so it can't touch anything else.
4. **Let it use only that bucket:** open the bucket → Permissions → Grant access. Paste the service account's email (it ends in `.iam.gserviceaccount.com`), and add two roles:
   - **Storage Object Admin**, to read, write and delete backup files;
   - **Storage Legacy Bucket Reader**, so restic can check the bucket exists.
5. **Key file:** go to Service Accounts → `beamhaven-backup` → Keys → Add key → Create new key → JSON. A `.json` file downloads to your Mac. **Save it in your password manager.** If Google says key creation is disabled, send Claude the message.
6. **Mac, Terminal:** copy the key to the VM:
   `scp ~/Downloads/<the file>.json <your user>@<VM IP>:/opt/beamhaven/gcs-key.json`
7. **VM:** run `chmod 600 gcs-key.json`. Then add these lines to `.env` (with `nano .env`), using your bucket name and project ID: `RESTIC_REPOSITORY=gs:<bucket>:/beamhaven`, `GOOGLE_PROJECT_ID=<project ID>`, and `RESTIC_PASSWORD=` (made as in step 2 of "Setting it up" above). Git ignores `gcs-key.json`, so it's never committed.

Cost: the Standard class costs about 2 cents per GB per month, so a few GB of backups is a few cents a month. Downloading for a restore costs about 12 cents per GB.

**Useful commands** (on the VM, in `/opt/beamhaven`):

| Task                                | Command                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- |
| List the off-site backups           | `./scripts/server/offsite.sh snapshots`                                     |
| Bring the newest one back to the VM | `./scripts/server/offsite.sh restore latest --target /backups/from-offsite` |
| Check the repository                | `./scripts/server/offsite.sh check` (backup.sh also checks 5% every Sunday) |
| See what local pruning would delete | `./scripts/server/prune-backups.sh --dry-run`                               |

A restore from off-site lands in `backups/from-offsite/backups/`. Use those files with `restore.sh` below.

## Recovery procedures

1. **Undo a mistake or a bad update (same VM):**
   - `./scripts/server/restore.sh backups/beamhaven-db-<time>.dump backups/beamhaven-uploads-<time>.tar.gz`
   - It asks you to type `RESTORE`, saves a copy of the current database in `backups/before-restore/`, stops the website and worker, replaces the database and files, and starts them again.
2. **Go back to the previous version of the code:** see "If an update goes wrong" in `DEPLOYMENT.md`. If that update changed the database, also restore the backup `update.sh` took just before it.
3. **Lost the VM:**
   - Build a new one with `DEPLOYMENT.md`, steps 1 to 6, and copy `.env` back from your password manager.
   - Get the newest backup with `offsite.sh restore latest …` (step above), and restore it with `restore.sh`.
   - Point Nginx Proxy Manager at the new VM's IP.
4. **Check a restore worked:**
   - `./scripts/server/restore-check.sh` ends with `RESTORE CHECK PASSED`. It checks the health page, prints how many logins, households, projects, expenses and files there are, and checks every uploaded file is on disk.
   - You can sign in.
   - The newest expense you remember is there.
   - A recent receipt or photo opens.
