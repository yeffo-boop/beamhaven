import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  deleteMilestoneRow,
  findMilestone,
  insertMilestone,
  listMilestones,
  type MilestoneRecord,
  type SaveMilestoneResult,
  updateMilestoneRow,
} from "@/server/data/milestones";

import { milestoneInput } from "./contractor-inputs";
import { fieldError, NotFoundError } from "./errors";
import type { FormInput } from "./inputs";

/** Project milestones (Milestone 7, part 1, ADR-031). */

export type MilestoneInput = FormInput<typeof milestoneInput>;

export async function getMilestones(
  ctx: WorkspaceContext,
  where: { projectId?: string } = {},
): Promise<MilestoneRecord[]> {
  assertCan(ctx, "records:view");
  return listMilestones(ctx, where);
}

export async function getMilestone(ctx: WorkspaceContext, id: string): Promise<MilestoneRecord> {
  assertCan(ctx, "records:view");
  const m = await findMilestone(ctx, id);
  if (!m) throw new NotFoundError("milestone");
  return m;
}

function check(result: SaveMilestoneResult): string {
  if (result.status === "not_found") throw new NotFoundError("project or milestone");
  if (result.status === "duplicate") {
    throw fieldError("name", "This project already has a milestone with that name");
  }
  return result.id;
}

export async function createMilestone(
  ctx: WorkspaceContext,
  projectId: string,
  input: MilestoneInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = milestoneInput.parse(input);
  const id = check(await insertMilestone(ctx, projectId, fields));
  await recordActivity(ctx, {
    action: "project.milestone_added",
    entityType: "project",
    entityId: projectId,
    summary: `Added the milestone “${fields.name}”`,
  });
  return { id };
}

export async function updateMilestone(
  ctx: WorkspaceContext,
  id: string,
  input: MilestoneInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  check(await updateMilestoneRow(ctx, id, milestoneInput.parse(input)));
}

export async function deleteMilestone(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ projectId: string }> {
  assertCan(ctx, "records:edit");
  const before = await getMilestone(ctx, id);
  const row = await deleteMilestoneRow(ctx, id);
  if (!row) throw new NotFoundError("milestone");
  await recordActivity(ctx, {
    action: "project.milestone_deleted",
    entityType: "project",
    entityId: row.projectId,
    summary: `Deleted the milestone “${before.name}”`,
  });
  return row;
}
