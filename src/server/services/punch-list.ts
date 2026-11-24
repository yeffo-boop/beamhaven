import "server-only";

import { z } from "zod";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  deletePunchItemRow,
  insertPunchItem,
  listPunchItems,
  type PunchItemRecord,
  setPunchStatusRow,
  updatePunchItemRow,
} from "@/server/data/punch-list";

import { removeFiles } from "./attachments";
import { NotFoundError } from "./errors";
import { type FormInput, optionalText, requiredText } from "./inputs";

/**
 * The punch list (Milestone 12, ADR-047): small things to fix before a
 * project is finished. Each item is open, then fixed (the contractor says
 * it's done), then signed off (someone in the household checked it).
 * The database allows only these values (punch_items_status_check).
 */
export const PUNCH_STATUSES = ["open", "fixed", "signed_off"] as const;
export type PunchStatus = (typeof PUNCH_STATUSES)[number];

export const PUNCH_STATUS_LABELS: Record<PunchStatus, string> = {
  open: "Open",
  fixed: "Fixed",
  signed_off: "Signed off",
};

export const punchItemInput = z.object({
  title: requiredText(200, "Say what needs fixing", "The item"),
  notes: optionalText(5000, "The notes"),
  roomId: optionalText(64, "The room"),
  contractorId: optionalText(64, "The contractor"),
});

export type PunchItemInput = FormInput<typeof punchItemInput>;

export async function getPunchList(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<PunchItemRecord[]> {
  assertCan(ctx, "records:view");
  return listPunchItems(ctx, { projectId });
}

export async function getPunchItem(ctx: WorkspaceContext, id: string): Promise<PunchItemRecord> {
  assertCan(ctx, "records:view");
  const [item] = await listPunchItems(ctx, { id });
  if (!item) throw new NotFoundError("punch item");
  return item;
}

/** How many are left to do, for the project page. */
export function punchSummary(items: { status: string }[]) {
  const count = (status: PunchStatus) => items.filter((i) => i.status === status).length;
  return { open: count("open"), fixed: count("fixed"), signedOff: count("signed_off") };
}

export async function createPunchItem(
  ctx: WorkspaceContext,
  projectId: string,
  input: PunchItemInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = punchItemInput.parse(input);
  const created = await insertPunchItem(ctx, projectId, fields);
  if (!created) throw new NotFoundError("project, room or contractor");
  await recordActivity(ctx, {
    action: "project.punch_added",
    entityType: "project",
    entityId: projectId,
    summary: `Added to the punch list: ${fields.title}`,
  });
  return created;
}

export async function updatePunchItem(
  ctx: WorkspaceContext,
  id: string,
  input: PunchItemInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await updatePunchItemRow(ctx, id, punchItemInput.parse(input)))) {
    throw new NotFoundError("punch item");
  }
}

export async function setPunchStatus(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const parsed = z.enum(PUNCH_STATUSES).parse(status);
  const item = await getPunchItem(ctx, id);
  if (!(await setPunchStatusRow(ctx, id, parsed))) throw new NotFoundError("punch item");
  if (parsed !== item.status) {
    await recordActivity(ctx, {
      action: "project.punch_status",
      entityType: "project",
      entityId: item.projectId,
      summary: `${PUNCH_STATUS_LABELS[parsed]}: ${item.title}`,
    });
  }
}

export async function deletePunchItem(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ projectId: string }> {
  assertCan(ctx, "records:edit");
  const item = await getPunchItem(ctx, id);
  const fileIds = await deletePunchItemRow(ctx, id);
  if (!fileIds) throw new NotFoundError("punch item");
  await removeFiles(ctx, fileIds);
  return { projectId: item.projectId };
}
