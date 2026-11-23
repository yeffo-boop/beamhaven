# Progress Log

Newest entries at the top. Each entry records what was done, which files changed, which tests ran, any open issues, and the next step.

---

## 2026-11-23: Milestone 0 (Discovery and Architecture), in review

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
