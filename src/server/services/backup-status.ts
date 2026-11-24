import "server-only";

import { readFile } from "node:fs/promises";

import { getEnv } from "@/config/env";
import { can } from "@/server/auth/permissions";
import type { WorkspaceContext } from "@/server/data/context";

import { type BackupHealth, backupHealth } from "./backup-status-rules";

/**
 * The server's backup health, for owners only (they're the ones who can fix
 * it). Null for everyone else, and when this isn't a server with backups.
 */
export async function getBackupHealth(
  ctx: WorkspaceContext,
  now: Date = new Date(),
): Promise<BackupHealth | null> {
  if (!can(ctx, "workspace:manage")) return null;
  const file = getEnv().BACKUP_STATUS_FILE;
  if (!file) return null;
  let text: string | null;
  try {
    text = await readFile(file, "utf8");
  } catch {
    // No file yet: no backup has ever finished on this server.
    text = null;
  }
  return backupHealth(text, now);
}
