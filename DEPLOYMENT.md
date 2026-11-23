# Deployment

**Status:** an architecture overview, written in Milestone 0. The step-by-step commands are added in **Milestone 2.5** (staging) and **Milestone 10** (production), and each one is tested on the real VM before it goes into this file.

We never invent IP addresses, VM IDs or storage names. Anywhere you see `<LIKE_THIS>`, that's a value we'll fill in together from your real setup.

## How traffic flows

```
Internet
   │  HTTPS 443
   ▼
GoDaddy DNS: beamhaven.thehoschak.com → your public IP
   │
   ▼
Your router (forwards 80/443 to Nginx Proxy Manager, as it already does for your other sites)
   │
   ▼
Nginx Proxy Manager (on the Proxmox host; handles the HTTPS certificate)
   │  plain HTTP over the internal network, to <BEAMHAVEN_VM_IP>:3000
   ▼
BeamHaven VM (Ubuntu Server LTS)
   ├─ UFW firewall: port 3000 only accepts traffic from <NPM_IP>; SSH only from your LAN
   └─ Docker Compose
        ├─ app     (Next.js, port 3000)
        ├─ db      (PostgreSQL; NOT published; only reachable by app inside Docker)
        └─ worker  (added in Milestone 7 for reminders)
   Volumes: postgres-data, uploads
```

## What we'll set up, in order (Milestone 2.5)

1. **Choose the Ubuntu release.** We'll use the newest Ubuntu Server **LTS** (Long-Term Support) release that has had at least its first point update, and confirm the exact version together on the day.
2. **Create the VM in Proxmox**, through the web interface, with screenshots-style instructions. Starting size: **2 vCPU, 4 GB RAM, a 40 GB system disk, plus a separate 50+ GB data disk** for the database and uploads, so it's easy to grow and back up. We'll adjust these numbers to fit your host.
3. **Install Ubuntu**, enabling OpenSSH and creating a non-root admin user.
4. **Give the VM a fixed IP address**, using the method you already use for your other servers.
5. **Set up SSH keys from your MacBook**, then turn off password logins.
6. **Updates:** apply all updates now, and turn on `unattended-upgrades` so security fixes install automatically.
7. **Firewall (UFW):** allow SSH from your LAN only, allow port 3000 from Nginx Proxy Manager's IP only, and deny everything else.
8. **Install Docker Engine and Docker Compose** from Docker's official repository.
9. **Docker and the firewall:** a published Docker port skips UFW by default. To prevent that, we'll publish the app on the VM's LAN IP only, and add a `DOCKER-USER` firewall rule so only Nginx Proxy Manager's IP can reach port 3000.
10. **Deploy the app:** copy `docker-compose.yml` and `.env` to `/opt/beamhaven`, then run `docker compose up -d`.
11. **Nginx Proxy Manager proxy host:**
    - Domain: `beamhaven.thehoschak.com`, forwarding to `http://<BEAMHAVEN_VM_IP>:3000`.
    - SSL: request a Let's Encrypt certificate, and turn on Force SSL, HTTP/2 and HSTS.
    - Turn on Websockets support.
    - Advanced: `client_max_body_size 25m;`, matching `UPLOAD_MAX_MB`.
    - Nginx Proxy Manager sends the `X-Forwarded-For` and `X-Forwarded-Proto` headers. The app trusts them only when `TRUST_PROXY=true`.
12. **GoDaddy DNS:** add an `A` record for `beamhaven` pointing to your public IP (or a `CNAME` to a hostname you already use).
13. **Verify:** check HTTPS works, the login cookie is marked `Secure`, Postgres can't be reached from your Mac, and `/api/health` reports OK.

## Updating BeamHaven (once production is live)

The short version, which gets expanded in Milestone 10:

1. Take a backup (see `BACKUP_AND_RECOVERY.md`).
2. On the VM, set the new version tag and run `docker compose pull && docker compose up -d`.
3. The app runs `prisma migrate deploy` as it starts.
4. Check `/api/health` and log in.
5. If something breaks, roll back to the previous tag. If the migration changed data, restore the backup from step 1.

## Things to decide before Milestone 2.5

- **Nginx Proxy Manager's internal IP**, and whether it runs in an LXC container, a VM or Docker.
- Whether the staging site gets its own address (for example `beamhaven-staging.thehoschak.com`), or whether we use the real address and later wipe the staging data before going live.
- **Where the app's Docker image is built:** on the VM itself (simplest), or by GitHub Actions and stored in GitHub's container registry (cleaner rollbacks). The recommendation is to start on the VM and move to GitHub Actions in Milestone 10.
