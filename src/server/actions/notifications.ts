"use server";

import { refresh } from "next/cache";

import { requireWorkspace } from "@/server/auth/workspace";
import { markNotificationRead } from "@/server/services/notifications";
import { markReminderRead } from "@/server/services/reminders";

import { text } from "./helpers";

/** Marks one notification read (Milestone 9, part 4). */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id").trim();
  if (id) await markNotificationRead(ctx, id);
  refresh();
}

/** Marks every notification and reminder read. */
export async function markEverythingReadAction(): Promise<void> {
  const ctx = await requireWorkspace();
  await markNotificationRead(ctx);
  await markReminderRead(ctx);
  refresh();
}
