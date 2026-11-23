# Changing BeamHaven's Public Domain

BeamHaven is built so its address can change, for example from `beamhaven.thehoschak.com` to a commercial domain, **without rebuilding the app, recreating accounts or moving any data**.

## Why this works

- The domain exists in exactly one place: the server-side `APP_URL` environment variable (ADR-011).
- It is read when the app **runs**, not when it's built, so nothing in the browser code contains the domain.
- Links inside the app are relative (`/projects/abc`), so they work on any domain.
- Links that must be absolute (invites, password resets, emails, OAuth callbacks) are built on demand from `APP_URL`.
- The database stores no domains.

## Steps

Example: moving from `beamhaven.thehoschak.com` to `app.newname.com`.

1. **Back up first** (see `BACKUP_AND_RECOVERY.md`).
2. **DNS:** at the registrar for the new domain, point `app.newname.com` at your public IP.
3. **Nginx Proxy Manager:** add `app.newname.com` to the existing BeamHaven proxy host (or create a new one), and request a Let's Encrypt certificate for it.
4. **Wait until the new address loads over HTTPS.** It will still show the old URL in links until the next step.
5. **Update the setting:** on the VM, edit `/opt/beamhaven/.env` and set `APP_URL=https://app.newname.com`.
6. **Restart:** `docker compose up -d` (the app container restarts with the new value; nothing is rebuilt).
7. **External callbacks:** update any service that has the old URL registered. There are none today. Later this might include OAuth providers (Google sign-in), email provider link settings, or webhooks.
8. **Redirect the old domain (recommended):** in Nginx Proxy Manager, turn the old host into a **301 redirect** to the new domain, keeping the path. Keep it for at least a year.
9. **Verify:** log in on the new domain, send yourself a test invitation and check that its link uses the new domain, then open a file download.

## What happens to…

| Thing | Effect |
|---|---|
| **Existing logins (sessions)** | Login cookies belong to a single domain, so **everyone has to sign in once** on the new domain. No accounts or data are lost. |
| **Bookmarks** | They keep working **if** you set up the redirect in step 8. Otherwise they break. |
| **Invitation and password-reset links already sent** | They contain the old domain. They work while the redirect is in place. To be safe, re-send any invitations that are still pending. |
| **Emails already sent** | Same as above: they rely on the redirect. |
| **Uploaded files** | No change; file links are relative and checked for permission on every request. |
| **Installed "Add to Home Screen" shortcuts** (if we add that) | They need re-adding on the new domain. |

## Rolling back

Set `APP_URL` back to the old value and restart. Both domains can be pointed at the app during the switch.
