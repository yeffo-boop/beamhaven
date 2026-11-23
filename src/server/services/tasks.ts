import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  deleteTaskRow,
  deleteWarrantyRow,
  findTask,
  insertTask,
  insertWarranty,
  listTasks,
  listWarranties,
  setTaskStatus,
  type TaskFields,
  type TaskRecord,
  updateTaskRow,
  updateWarrantyRow,
  type WarrantyRecord,
} from "@/server/data/tasks";

import { removeFiles } from "./attachments";
import { taskInput, taskStatusInput, warrantyInput } from "./contractor-inputs";
import { NotFoundError } from "./errors";
import type { FormInput } from "./inputs";

// --- Tasks -----------------------------------------------------------------

export type TaskInput = FormInput<typeof taskInput>;

export async function getTasks(
  ctx: WorkspaceContext,
  where: { projectId?: string; roomId?: string; assigneeContractorId?: string },
): Promise<TaskRecord[]> {
  assertCan(ctx, "records:view");
  return listTasks(ctx, where);
}

export async function getTask(ctx: WorkspaceContext, id: string): Promise<TaskRecord> {
  assertCan(ctx, "records:view");
  const task = await findTask(ctx, id);
  if (!task) throw new NotFoundError("task");
  return task;
}

function taskFields(input: TaskInput): TaskFields {
  const { assignee, ...rest } = taskInput.parse(input);
  return {
    ...rest,
    assigneeUserId: assignee.userId,
    assigneeContractorId: assignee.contractorId,
  };
}

export async function createTask(ctx: WorkspaceContext, input: TaskInput): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = taskFields(input);
  const created = await insertTask(ctx, fields);
  if (!created) throw new NotFoundError("project, room or assignee");
  if (fields.projectId) {
    await recordActivity(ctx, {
      action: "project.task_added",
      entityType: "project",
      entityId: fields.projectId,
      summary: `Added the task “${fields.title}”`,
    });
  }
  return created;
}

export async function updateTask(
  ctx: WorkspaceContext,
  id: string,
  input: TaskInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await updateTaskRow(ctx, id, taskFields(input)))) throw new NotFoundError("task");
}

export async function changeTaskStatus(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const parsed = taskStatusInput.parse(status);
  if (!(await setTaskStatus(ctx, id, parsed))) throw new NotFoundError("task");
}

export async function deleteTask(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await deleteTaskRow(ctx, id))) throw new NotFoundError("task");
}

// --- Warranties ------------------------------------------------------------

export type WarrantyInput = FormInput<typeof warrantyInput>;

export async function getWarranties(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string; roomId?: string },
): Promise<WarrantyRecord[]> {
  assertCan(ctx, "records:view");
  return listWarranties(ctx, where);
}

export async function getWarranty(ctx: WorkspaceContext, id: string): Promise<WarrantyRecord> {
  assertCan(ctx, "records:view");
  const [warranty] = await listWarranties(ctx, { id });
  if (!warranty) throw new NotFoundError("warranty");
  return warranty;
}

export async function createWarranty(
  ctx: WorkspaceContext,
  input: WarrantyInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = warrantyInput.parse(input);
  const created = await insertWarranty(ctx, fields);
  if (!created) throw new NotFoundError("contractor, project or room");
  if (fields.contractorId) {
    await recordActivity(ctx, {
      action: "contractor.warranty_added",
      entityType: "contractor",
      entityId: fields.contractorId,
      summary: `Added a warranty: ${fields.coverage}`,
    });
  }
  return created;
}

export async function updateWarranty(
  ctx: WorkspaceContext,
  id: string,
  input: WarrantyInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await updateWarrantyRow(ctx, id, warrantyInput.parse(input)))) {
    throw new NotFoundError("warranty");
  }
}

export async function deleteWarranty(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const fileIds = await deleteWarrantyRow(ctx, id);
  if (!fileIds) throw new NotFoundError("warranty");
  await removeFiles(ctx, fileIds);
}
