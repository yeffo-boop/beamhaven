import { CircleAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { LocalTime } from "@/components/records/local-time";
import { getWorkspaceContext } from "@/server/auth/workspace";
import type { BackupHealth } from "@/server/services/backup-status-rules";
import { getBackupHealth } from "@/server/services/backup-status";

function problem(health: BackupHealth): string | null {
  switch (health.state) {
    case "ok":
      return null;
    case "never":
      return "No backup has finished on this server yet.";
    case "late":
      return "The last good backup is more than two days old. The nightly backup may have stopped.";
    case "failing":
      return `The last backup failed. ${health.message}`;
    case "offsite_failed":
      return "The backup worked, but the off-site copy didn't.";
  }
}

function lastGood(health: BackupHealth) {
  if (health.state === "never" || !health.lastSuccessAt) return null;
  return (
    <>
      Last good backup: <LocalTime iso={health.lastSuccessAt.toISOString()} />.
    </>
  );
}

/**
 * A warning for owners when the server's backups aren't working (ADR-041).
 * Shows nothing when they are, to anyone else, or on a Mac.
 */
export async function BackupWarning() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const health = await getBackupHealth(ctx);
  const text = health ? problem(health) : null;
  if (!health || !text) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--radius-card)] border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Backups need attention</p>
        <p>
          {text} {lastGood(health)}
        </p>
        <p className="text-muted-foreground">
          See “Backups” in{" "}
          <Link href="/settings#backups-heading" className="text-primary hover:underline">
            Settings
          </Link>{" "}
          for what to do.
        </p>
      </div>
    </div>
  );
}

/** The Backups section of Settings, for owners on the server. */
export async function BackupSettings() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const health = await getBackupHealth(ctx);
  if (!health) return null;
  const text = problem(health);
  return (
    <section
      aria-labelledby="backups-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6"
    >
      <h2 id="backups-heading" className="font-semibold">
        Backups
      </h2>
      {text ? (
        <p className="flex items-start gap-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            {text} {lastGood(health)}
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Backups are working. {lastGood(health)}{" "}
            {health.state === "ok" && health.offsite === "ok"
              ? "An encrypted copy is also kept off-site."
              : "There's no off-site copy yet."}
          </span>
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        A backup runs every night on the server and before each update. To run one now, or to see
        why one failed, run <code>./scripts/server/backup.sh</code> on the server (see
        BACKUP_AND_RECOVERY.md).
      </p>
    </section>
  );
}
