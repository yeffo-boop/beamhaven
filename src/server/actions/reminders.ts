"use server";

import { refresh } from "next/cache";

import { requireWorkspace } from "@/server/auth/workspace";
import { markReminderRead } from "@/server/services/reminders";

import { text } from "./helpers";

/** Marks one reminder read, or all of them when no id is sent (Milestone 7, part 3). */
export async function markReminderReadAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id").trim();
  await markReminderRead(ctx, id || undefined);
  refresh();
}
