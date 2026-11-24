# Production Checklist

BeamHaven is ready for real data when every box below is ticked. Work top to bottom. Each step says **where** it runs. "VM" means you're signed in to the BeamHaven VM over SSH from Terminal on your Mac, in `/opt/beamhaven`.

If a command doesn't print what's described, stop and send Claude the output.

## 1. The server is up to date and healthy

- [ ] **VM:** `git pull`, then `./scripts/server/update.sh`.
  - Success: it ends without an error.
  - Then `docker compose ps` shows `app`, `db` and `worker` as `healthy`.
- [ ] **Mac browser:** `https://beamhaven.thehoschak.com/api/health` shows `"status":"ok"`.
- [ ] **VM:** `docker compose ps` doesn't list a port for `db`. The database must never be reachable from outside.
- [ ] **Nginx Proxy Manager:** the BeamHaven proxy host has an SSL certificate, with "Force SSL" on.

## 2. It survives a reboot

- [ ] **VM:** `sudo reboot`. Wait two minutes, sign in again, and run `docker compose ps`.
  - Success: all three are `healthy` again, and you didn't start anything yourself.

## 3. Backups run, and a copy leaves the house

- [ ] **VM:** `./scripts/server/backup.sh` ends with `Done:` and two file names.
- [ ] **VM:** `crontab -l` shows the nightly backup line from `DEPLOYMENT.md`, step 9.
- [ ] **Off-site:** set up as described in `BACKUP_AND_RECOVERY.md`, "Off-site copies".
  - Run `./scripts/server/backup.sh` again.
  - Success: Settings → Backups says there's an off-site copy.
- [ ] **Password manager:** these are saved in it:
  - `.env` (all of it);
  - the `RESTIC_PASSWORD`;
  - the B2 application key, if you use B2.
- [ ] **The next morning:** Settings → Backups shows a backup from about 2:00 AM, and Home shows no backup warning.

## 4. A restore has been tested on a fresh VM

This proves you could recover if the VM were lost. Do it on a **second, temporary VM**, so the real one is never at risk.

- [ ] **Proxmox:** create a temporary VM using `DEPLOYMENT.md`, steps 2 to 6.
  - Copy `.env` from your password manager.
  - Keep the `RESTIC_` and `B2_` lines.
  - Change two lines: `APP_BIND_IP=<temporary VM IP>` and `APP_URL=http://localhost:3000`.
  - Skip step 7 (Nginx Proxy Manager), so the real address keeps pointing at the real VM.
- [ ] **Temporary VM:** `./scripts/server/offsite.sh restore latest --target /backups/from-offsite`.
- [ ] **Temporary VM:** `./scripts/server/restore.sh backups/from-offsite/backups/beamhaven-db-<time>.dump backups/from-offsite/backups/beamhaven-uploads-<time>.tar.gz`, then type `RESTORE`.
- [ ] **Temporary VM:** `./scripts/server/restore-check.sh` ends with `RESTORE CHECK PASSED`.
  - The numbers it prints match what you expect.
  - The newest expense is the last one you entered.
- [ ] **Mac:** the firewall only lets Nginx Proxy Manager reach the website, so reach it through SSH instead.
  - In a new Terminal window, run `ssh -L 3000:<temporary VM IP>:3000 <your user>@<temporary VM IP>` and leave it open.
  - In your browser, go to `http://localhost:3000`. Sign in, and open a recent receipt or photo.
  - If the page doesn't open, send Claude what the Terminal window shows.
- [ ] **Proxmox:** delete the temporary VM. Only that one!
- [ ] Write down the date of the test in `PROGRESS.md`, or tell Claude, so it can be recorded.

## 5. Clear the test data (only when you're ready)

This deletes **everything** in BeamHaven: every login, household, record and uploaded file. It keeps a backup first, in `backups/before-wipe/`, so it can be undone.

- [ ] **VM:** `./scripts/server/wipe-test-data.sh`, then type `WIPE`.
  - Success: it ends with "Wiped." and prints the restore command that would undo it.
- [ ] **VM:** `docker compose run --rm ops npm run create-first-account` creates your login again.
- [ ] **Mac browser:** sign in, set up the household, and invite the others.
- [ ] **VM:** `./scripts/server/backup.sh`, so the first backup of the real data exists.

## 6. Still to do later

- **SSH:** sign in with a key only, with passwords off. Re-run `setup-vm.sh` without `--skip-ssh` (`DEPLOYMENT.md`, step 4).
- **Email**, for invitations and password resets (a later milestone). Until then, `password-reset-link` makes reset links.
- **Images built by GitHub Actions**, so going back a version is one step instead of a rebuild.
- **Repeat the restore test** (section 4) every few months, and after big changes.
