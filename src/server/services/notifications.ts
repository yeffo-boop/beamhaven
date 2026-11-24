import "server-only";

import { assertCan } from "@/server/auth/permissions";
import type { WorkspaceContext } from "@/server/data/context";
import {
  countUnreadNotifications,
  findBoardCreator,
  findQuoteCreator,
  findTaskPeople,
  insertNotifications,
  listNotifications,
  markNotificationsRead,
  type NotificationRecord,
} from "@/server/data/notifications";

/**
 * In-app notifications about what other people did that involves you
 * (Milestone 9, part 4, ADR-040). Writing one never stops the change it's
 * about: the change has already been saved when these run.
 */

export async function getNotifications(ctx: WorkspaceContext): Promise<NotificationRecord[]> {
  assertCan(ctx, "records:view");
  return listNotifications(ctx);
}

export async function getUnreadNotificationCount(ctx: WorkspaceContext): Promise<number> {
  assertCan(ctx, "records:view");
  return countUnreadNotifications(ctx);
}

/** Only changes the person's own list, so viewers may do it too. */
export async function markNotificationRead(ctx: WorkspaceContext, id?: string): Promise<void> {
  assertCan(ctx, "records:view");
  await markNotificationsRead(ctx, id);
}

/** Someone gave a household member a task (new, or a change of who it's for). */
export async function notifyTaskAssigned(
  ctx: WorkspaceContext,
  taskId: string,
  title: string,
  assigneeUserId: string | null,
): Promise<void> {
  if (!assigneeUserId) return;
  await insertNotifications(ctx, [
    {
      userId: assigneeUserId,
      kind: "task_assigned",
      summary: `gave you the task “${title}”`,
      href: `/tasks/${taskId}`,
    },
  ]);
}

/** Someone finished a task: tell whoever made it and whoever it was for. */
export async function notifyTaskDone(ctx: WorkspaceContext, taskId: string): Promise<void> {
  const task = await findTaskPeople(ctx, taskId);
  if (!task) return;
  const people = [task.createdById, task.assigneeUserId].filter((id): id is string => !!id);
  await insertNotifications(
    ctx,
    people.map((userId) => ({
      userId,
      kind: "task_done" as const,
      summary: `finished the task “${task.title}”`,
      href: `/tasks/${taskId}`,
    })),
  );
}

/** Someone approved or turned down a quote: tell whoever entered it. */
export async function notifyQuoteDecided(
  ctx: WorkspaceContext,
  quoteId: string,
  title: string,
  approved: boolean,
): Promise<void> {
  const creator = await findQuoteCreator(ctx, quoteId);
  if (!creator) return;
  await insertNotifications(ctx, [
    {
      userId: creator,
      kind: "quote_decided",
      summary: approved ? `approved the quote “${title}”` : `turned down the quote “${title}”`,
      href: `/quotes/${quoteId}`,
    },
  ]);
}

/** Someone approved something on a design board: tell whoever started the board. */
export async function notifyBoardItemApproved(
  ctx: WorkspaceContext,
  boardId: string,
  itemTitle: string,
): Promise<void> {
  const creator = await findBoardCreator(ctx, boardId);
  if (!creator) return;
  await insertNotifications(ctx, [
    {
      userId: creator,
      kind: "board_item_approved",
      summary: `approved “${itemTitle}” on a design board`,
      href: `/inspiration/${boardId}`,
    },
  ]);
}
