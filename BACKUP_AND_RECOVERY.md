# Backup and Recovery

**Status:** the strategy is set in Milestone 0. Scripts and exact commands are added and **tested** in Milestone 2.5 (manual backup and restore) and Milestone 10 (automated and off-site). Production isn't considered done until a restore has been tested.

> You told us there is no backup plan today. This file is how we fix that for BeamHaven.

## What must be backed up

| What                                                  | Why                                              | How                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL database**                               | All your records                                 | `pg_dump` in custom format (`-Fc`), run inside the `db` container. This is a consistent snapshot, even while the app is running. |
| **Uploaded files**                                    | Receipts, photos, contracts                      | Copy the `uploads` volume (incremental, with `restic`)                                                                           |
| **`.env`**                                            | Secrets and settings needed to run the app again | Stored **encrypted** in the backup, and also in your password manager                                                            |
| **`docker-compose.yml` and the deployed version tag** | How to rebuild the app                           | In Git, plus a copy in each backup                                                                                               |

**Why not just use Proxmox snapshots?** A snapshot taken while Postgres is writing can capture a half-written database. Snapshots also usually live on the same disk as the VM. They're a useful extra, for example right before an upgrade, but they're **not** our database backup.

## The proposed plan (we'll confirm it together)

- **Nightly at 2:00 AM:** a database dump plus a file backup, written first to a backup folder on the VM's data disk.
- **Then copied off the VM**, to a destination we still need to pick. Options, in order of preference:
  1. **Proxmox Backup Server or a NAS** on your network (free, and fast to restore from).
  2. **Cloud storage** such as Backblaze B2 (a few dollars a month at most, and it survives a house fire or theft). Encrypted before upload.
  3. A **USB drive** attached to the Proxmox host (better than nothing).
     Doing both 1 (or 3) and 2 gives the classic **3-2-1** setup: 3 copies, on 2 kinds of storage, with 1 off-site.
- **How long we keep backups:** 7 daily, 4 weekly, 12 monthly.
- **Monitoring:** the backup script reports success or failure to the app's health page, and BeamHaven shows a warning banner to Owners if the last good backup is more than 48 hours old.
- **A monthly restore test:** restore the latest backup into a throwaway container and check the record counts. Once a year, we do a full rebuild on a fresh VM.

## Recovery procedures (detailed in Milestone 10)

1. **Restore the database:** stop `app`, then `pg_restore --clean --if-exists` into `db`, then start `app`.
2. **Restore the uploaded files:** `restic restore` into the `uploads` volume.
3. **Rebuild the containers:** `git checkout <tag>`, then `docker compose up -d --build`.
4. **Recover from a failed update:** roll back to the previous image tag. If the migration changed data, restore the database dump taken just before the update.
5. **Move to a replacement VM:** follow `DEPLOYMENT.md` to build the new VM, copy `.env`, restore the database and files, then point Nginx Proxy Manager at the new IP.
6. **Verify a restore:** `/api/health` reports OK, you can log in, the latest expense you remember is there, and a recent receipt opens.

## Decision needed from Jeff (before Milestone 2.5)

Which off-VM backup destination should we use: a NAS or Proxmox Backup Server, Backblaze B2, a USB drive, or a combination?
