import { z } from "zod";

/**
 * How healthy the server's backups are, from the status file backup.sh
 * writes (Milestone 10, part 1, ADR-041). Pure, so it's unit-tested.
 */

/** Backups run nightly; after this long without a good one, owners are warned. */
export const BACKUP_LATE_HOURS = 48;

const statusFile = z.object({
  finishedAt: z.string(),
  ok: z.boolean(),
  lastSuccessAt: z.string(),
  offsite: z.enum(["ok", "skipped", "failed"]),
  message: z.string(),
});

export type BackupHealth =
  | { state: "ok"; lastSuccessAt: Date; offsite: "ok" | "skipped" }
  | { state: "late"; lastSuccessAt: Date | null; offsite: string }
  | { state: "failing"; lastSuccessAt: Date | null; message: string }
  | { state: "offsite_failed"; lastSuccessAt: Date | null }
  | { state: "never" };

function date(value: string): Date | null {
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

/** Reads the file's text (null when there's no file yet) as of `now`. */
export function backupHealth(text: string | null, now: Date): BackupHealth {
  if (text === null) return { state: "never" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: "failing", lastSuccessAt: null, message: "The backup status can't be read." };
  }
  const parsed = statusFile.safeParse(raw);
  if (!parsed.success) {
    return { state: "failing", lastSuccessAt: null, message: "The backup status can't be read." };
  }
  const s = parsed.data;
  const lastSuccessAt = date(s.lastSuccessAt);
  if (!s.ok) {
    return { state: "failing", lastSuccessAt, message: s.message || "The last backup failed." };
  }
  if (s.offsite === "failed") return { state: "offsite_failed", lastSuccessAt };
  const ageHours = lastSuccessAt ? (now.getTime() - lastSuccessAt.getTime()) / 3_600_000 : Infinity;
  if (!lastSuccessAt || ageHours > BACKUP_LATE_HOURS) {
    return { state: "late", lastSuccessAt, offsite: s.offsite };
  }
  return { state: "ok", lastSuccessAt, offsite: s.offsite };
}
