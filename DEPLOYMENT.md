# Deployment

**Status:** Milestone 2.5 (staging). The files these steps use (`Dockerfile`, `docker-compose.yml`, `scripts/server/`) were tested in Docker in the cloud workspace on 2026-11-23. The steps on the real VM get checked off as we do them together, and anything that turns out different gets corrected here. Milestone 10 adds production polish: automatic off-site backups and versioned images.

Values you'll see in `<LIKE_THIS>` come from your setup. The ones we know:

| Value                      | What it is                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `10.0.0.134`               | Nginx Proxy Manager (runs in an LXC on Proxmox)                                                        |
| `10.0.0.0/24`              | Your LAN (every `10.0.0.x` address)                                                                    |
| `beamhaven.thehoschak.com` | The address. A wildcard CNAME already sends it to Nginx Proxy Manager, so no new DNS record is needed. |
| `<BEAMHAVEN_VM_IP>`        | The VM's address, chosen during step 3                                                                 |
| `<ADMIN_USER>`             | The login name you create on the VM in step 3                                                          |

## How traffic flows

```
Browser ── HTTPS ──▶ GoDaddy DNS (wildcard CNAME) ──▶ your router ──▶ Nginx Proxy Manager (10.0.0.134, owns the certificate)
                                                                         │ plain HTTP on your LAN
                                                                         ▼
                                                       BeamHaven VM  <BEAMHAVEN_VM_IP>:3000
                                                       ├─ firewall: port 3000 only from 10.0.0.134, SSH only from 10.0.0.x
                                                       └─ Docker Compose (/opt/beamhaven)
                                                            ├─ app      the website (port 3000)
                                                            ├─ migrate  updates database tables, then exits
                                                            ├─ db       PostgreSQL, NOT published, only reachable by app
                                                            └─ ops      admin commands, only when we run them
                                                       Volumes: db-data, uploads.  Backups: /opt/beamhaven/backups
```

## Step 1: Get the Ubuntu installer into Proxmox

**Where:** your Mac's web browser, then the Proxmox web UI.

1. Open <https://ubuntu.com/download/server> and copy the download link for the newest **Ubuntu Server LTS** (as of November 2026, the newest `26.04.x LTS`). If the page shows something different, tell me what it says before going on.
2. In the Proxmox web UI's left sidebar: your node → **local** storage → **ISO Images** → **Download from URL**. Paste the link, click **Query URL**, then **Download**.

**Success:** the ISO shows up in the list. **If it fails:** paste the task log's error here.

## Step 2: Create the VM

**Where:** Proxmox web UI → **Create VM** (top right).

Keep the defaults except for these:

| Tab     | Setting    | Value                      | Why                                                   |
| ------- | ---------- | -------------------------- | ----------------------------------------------------- |
| General | Name       | `beamhaven`                |                                                       |
| OS      | ISO image  | the Ubuntu ISO from step 1 |                                                       |
| System  | QEMU Agent | ticked                     | Proxmox can show the VM's IP and shut it down cleanly |
| Disks   | Disk size  | `40` GB                    | room for Docker images, the database and backups      |
| CPU     | Cores      | `2`                        | building the app is slow on 1                         |
| Memory  | Memory     | `4096` MB                  | building the app needs more than the default 2 GB     |

Then **Finish**, select the VM, and click **Start** and **Console**.

## Step 3: Install Ubuntu Server

**Where:** the VM's **Console** in Proxmox.

Go through the installer with the defaults, except:

- **Network:** the installer gets an address automatically (it shows as `10.0.0.x/24`). Write that address down; it becomes `<BEAMHAVEN_VM_IP>`. Then make it permanent: select the network card → **Edit IPv4** → **Manual**, and enter:
  - Subnet: `10.0.0.0/24`
  - Address: the address you wrote down
  - Gateway and Name servers: the same ones your other servers use. If you're not sure, check one of them, or ask me how.

  > Your router may hand out that same address to another device later. If your router has a range of addresses it gives out automatically (the "DHCP pool"), it's safer to choose an address outside it, the way your other servers do.

- **Profile:** your name, server name `beamhaven`, and a username (this is `<ADMIN_USER>`) and password. Save the password in your password manager. You'll still need it for `sudo`.
- **SSH:** tick **Install OpenSSH server**. Leave "Import SSH identity" off; we do it in step 4.
- **Featured server snaps:** choose none (we install Docker properly in step 5).

When it says **Reboot now**, press it. Proxmox may ask you to remove the ISO; just press Enter in the console.

**Success:** the console shows a `beamhaven login:` prompt.

## Step 4: Log in from your Mac with an SSH key

**Where:** your MacBook, the **Terminal** app.

1. See whether you already have a key:

   ```
   ls ~/.ssh/id_ed25519.pub
   ```

   If it says "No such file", make one (press Enter at each question; a passphrase is optional but recommended):

   ```
   ssh-keygen -t ed25519
   ```

2. Copy the key to the VM. It asks for the VM password from step 3:

   ```
   ssh-copy-id <ADMIN_USER>@<BEAMHAVEN_VM_IP>
   ```

3. Log in. It shouldn't ask for the VM password this time:

   ```
   ssh <ADMIN_USER>@<BEAMHAVEN_VM_IP>
   ```

**Success:** your prompt changes to `<ADMIN_USER>@beamhaven:~$`. **If it fails:** paste the whole output here.

## Step 5: Download BeamHaven and run the setup script

**Where:** the VM, through your SSH session from step 4.

```
sudo git clone https://github.com/yeffo-boop/beamhaven.git /opt/beamhaven
sudo chown -R $USER:$USER /opt/beamhaven
cd /opt/beamhaven
sudo ./scripts/server/setup-vm.sh 10.0.0.134 10.0.0.0/24
```

The script takes a few minutes. It:

1. installs every update and turns on automatic security updates;
2. installs Docker from Docker's own repository;
3. turns on the firewall: SSH only from `10.0.0.x`, port 3000 only from Nginx Proxy Manager, and the same limit inside Docker's own rules, because Docker's published ports skip the normal firewall;
4. turns off password logins for SSH, so only your key works. It refuses to do this if step 4's key isn't there, so you can't lock yourself out. If you ever do, the Proxmox **Console** still works with your password. Haven't set up your key yet? Add `--skip-ssh` to the end of the command, and run the script again without it once your key works.

**Success:** it ends with `Setup finished.` If it says updates need a restart, run `sudo reboot`, wait a minute, and SSH in again. Otherwise log out (`exit`) and back in, so `docker` works without `sudo`. **If it fails:** paste the last 30 lines.

## Step 6: Fill in the settings and start BeamHaven

**Where:** the VM, in `/opt/beamhaven`.

1. Make the settings file, readable only by you:

   ```
   cp .env.server.example .env
   chmod 600 .env
   ```

2. Make two secrets, and copy each one:

   ```
   openssl rand -hex 24
   openssl rand -base64 32
   ```

3. Edit the file with `nano .env`:
   - `APP_BIND_IP` = `<BEAMHAVEN_VM_IP>`
   - `POSTGRES_PASSWORD` = the first secret
   - `BETTER_AUTH_SECRET` = the second secret

   Save with **Ctrl+O**, then Enter, and exit with **Ctrl+X**. **Save both secrets in your password manager too.** A backup can't be restored without them.

4. Build and start everything. The first build takes about 5 to 10 minutes:

   ```
   docker compose up -d --build --wait
   docker compose ps
   ```

**Success:** `app` and `db` say `healthy`, and `migrate` says `exited (0)`. **If it fails:** run `docker compose logs --tail 50` and paste the output.

5. Create your login. It asks for your name, household, email and password:

   ```
   docker compose run --rm ops npm run create-first-account
   ```

## Step 7: Add the proxy host in Nginx Proxy Manager

**Where:** the Nginx Proxy Manager web UI → **Hosts** → **Proxy Hosts** → **Add Proxy Host**.

- **Details** tab:
  - Domain Names: `beamhaven.thehoschak.com`
  - Scheme `http`, Forward Hostname/IP `<BEAMHAVEN_VM_IP>`, Forward Port `3000`
  - Turn on **Block Common Exploits** and **Websockets Support**
- **SSL** tab: choose your existing wildcard certificate if you have one, or **Request a new SSL Certificate**. Turn on **Force SSL**, **HTTP/2 Support** and **HSTS Enabled**.
- **Advanced** tab, in Custom Nginx Configuration:

  ```
  client_max_body_size 25m;
  ```

  This is the largest upload allowed (it matches `UPLOAD_MAX_MB`; uploads arrive in Milestone 3).

Click **Save**. Nginx Proxy Manager already sends the visitor's real address in `X-Real-IP`, which the app uses for rate limits because `.env` has `TRUST_PROXY=true`.

## Step 8: Check it all works

| Check                              | Where                         | Command or action                                        | Expected                                                           |
| ---------------------------------- | ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Site loads over HTTPS              | Mac browser                   | open `https://beamhaven.thehoschak.com`                  | the sign-in page, with a padlock                                   |
| Health                             | Mac Terminal                  | `curl https://beamhaven.thehoschak.com/api/health`       | `"status":"ok"`                                                    |
| Sign in                            | Mac browser                   | sign in with the step 6 login                            | the dashboard                                                      |
| Login cookie is secure             | Mac browser                   | Safari: Develop → Show Web Inspector → Storage → Cookies | `__Secure-better-auth.session_token`, marked Secure and HttpOnly   |
| App port blocked for everyone else | Mac Terminal                  | `curl -m 5 http://<BEAMHAVEN_VM_IP>:3000/api/health`     | times out (only Nginx Proxy Manager may connect)                   |
| App port open for the proxy        | Proxmox → NPM's LXC → Console | `curl -m 5 http://<BEAMHAVEN_VM_IP>:3000/api/health`     | `"status":"ok"`                                                    |
| Database not reachable             | Mac Terminal                  | `nc -vz -w 5 <BEAMHAVEN_VM_IP> 5432`                     | fails or times out                                                 |
| Rate limit sees real visitors      | Mac browser                   | sign in with a wrong password 6 times                    | "Too many attempts" (and a phone on mobile data can still sign in) |

## Step 9: Back up, and test a restore

**Where:** the VM, in `/opt/beamhaven`.

```
./scripts/server/backup.sh
ls -lh backups
```

Then test a restore. **This replaces the current data with the backup**, which is fine now because staging only has test data:

```
./scripts/server/restore.sh backups/beamhaven-db-<time>.dump backups/beamhaven-uploads-<time>.tar.gz
```

It asks you to type `RESTORE`. Afterwards, sign in again to check.

Then run the backup every night at 2:00 AM. Run `crontab -e` (choose `nano` if asked), add this line at the bottom, and save:

```
0 2 * * * cd /opt/beamhaven && ./scripts/server/backup.sh >> backups/backup.log 2>&1
```

> These backups stay on the VM, so they protect against mistakes and bad updates, but not against losing the VM. Off-site copies are part of Milestone 10 (`BACKUP_AND_RECOVERY.md`).

## Updating BeamHaven

Nothing on the VM changes by itself. When a pull request has been merged into `main` and you want the server to have it, run one command.

**Where:** the VM, in `/opt/beamhaven` (Terminal on your Mac, connected with `ssh`, or the Proxmox console).

```
cd /opt/beamhaven
./scripts/server/update.sh
```

The very first time, `update.sh` doesn't exist on the VM yet, so run `git pull` first, then the command above.

**What it does:** takes a backup, downloads the newest code (`git pull`), rebuilds and restarts (the `migrate` step updates the database tables before the new website starts), and clears out old build images. It takes a few minutes.

**Success looks like:** it ends with `Done. BeamHaven is running version <abc1234>.` and `docker compose ps` shows `app` and `db` as `healthy` and `worker` as `running` (the worker has no health check; its log says what it did).

**If it fails,** it stops and says why. Nothing is lost: the backup was taken first. Paste the output to Claude.

### If an update goes wrong

The script prints the version you were on before (for example `abc1234`). To go back to it:

```
git checkout abc1234
docker compose up -d --build --wait
```

If the update had changed the database (the pull request will say so), also restore the backup it took: see `BACKUP_AND_RECOVERY.md`. When the fix is ready, `git checkout main` and run `update.sh` again.

### The background worker

From Milestone 7, a third container, `worker`, runs next to the website. It uses the same `ops` image and the same `.env`, has no ports, and every 15 minutes adds the reminders that are due (ADR-033). Its job queue lives in the database, in a `pgboss` schema, so the normal backup covers it. If it stops, the website keeps working; reminders just wait until it's back (`docker compose up -d worker`).

## Everyday commands

Run these on the VM, in `/opt/beamhaven`:

| Task                           | Command                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| What's running                 | `docker compose ps`                                                  |
| Website log                    | `docker compose logs -f app` (Ctrl+C to stop)                        |
| Background worker log          | `docker compose logs -f worker` (reminders, every 15 minutes)        |
| Restart after editing `.env`   | `docker compose up -d`                                               |
| Password-reset link            | `docker compose run --rm ops npm run password-reset-link -- <email>` |
| Stop everything (data is kept) | `docker compose down`                                                |

Never run `docker compose down -v`: the `-v` deletes the database.

## Before going live (Milestone 10)

Staging uses the real address. Before real data goes in, we wipe the test data (with your go-ahead), set up off-site backups, and move image builds to GitHub Actions for one-step rollbacks.
