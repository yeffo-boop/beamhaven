import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  deleteDependencyRow,
  deleteTaskRow,
  deleteWarrantyRow,
  findTask,
  insertDependency,
  insertTask,
  insertWarranty,
  listTaskChoices,
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
import { fieldError, NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";

// --- Tasks -----------------------------------------------------------------

export type TaskInput = FormInput<typeof taskInput>;

export async function getTasks(
  ctx: WorkspaceContext,
  where: {
    projectId?: string;
    roomId?: string;
    assigneeContractorId?: string;
    milestoneId?: string;
  } = {},
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

function taskProblem(result: { status: string; waitingOn?: string }, what: string): never {
  if (result.status === "wrong_milestone") {
    throw fieldError(
      "milestoneId",
      "That milestone is on another project. Pick one of this task's project, or none.",
    );
  }
  if (result.status === "blocked") {
    throw fieldError(
      "status",
      `This task waits on “${result.waitingOn ?? ""}”, which isn't done yet.`,
    );
  }
  throw new NotFoundError(what);
}

export async function createTask(ctx: WorkspaceContext, input: TaskInput): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = taskFields(input);
  const created = await insertTask(ctx, fields);
  if (created.status !== "saved") taskProblem(created, "project, room, milestone or assignee");
  if (fields.projectId) {
    await recordActivity(ctx, {
      action: "project.task_added",
      entityType: "project",
      entityId: fields.projectId,
      summary: `Added the task “${fields.title}”`,
    });
  }
  return { id: created.id };
}

export async function updateTask(
  ctx: WorkspaceContext,
  id: string,
  input: TaskInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await updateTaskRow(ctx, id, taskFields(input));
  if (result.status !== "saved") taskProblem(result, "task");
}

export async function changeTaskStatus(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const parsed = taskStatusInput.parse(status);
  const result = await setTaskStatus(ctx, id, parsed);
  if (result.status === "blocked") throw new RuleError("task_blocked");
  if (result.status !== "saved") throw new NotFoundError("task");
}

export async function deleteTask(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await deleteTaskRow(ctx, id))) throw new NotFoundError("task");
}

// --- Dependencies (ADR-031) ------------------------------------------------

export async function addDependency(
  ctx: WorkspaceContext,
  taskId: string,
  dependsOnId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!dependsOnId) throw fieldError("dependsOnId", "Choose the task it waits on");
  const result = await insertDependency(ctx, taskId, dependsOnId);
  if (result.status === "not_found") throw new NotFoundError("task");
  if (result.status === "self") throw fieldError("dependsOnId", "A task can't wait on itself");
  if (result.status === "exists") throw fieldError("dependsOnId", "It already waits on that task");
  if (result.status === "circular") {
    throw fieldError(
      "dependsOnId",
      "That task already waits on this one (maybe through others), so this would make a loop",
    );
  }
}

export async function removeDependency(
  ctx: WorkspaceContext,
  taskId: string,
  dependsOnId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await deleteDependencyRow(ctx, taskId, dependsOnId))) throw new NotFoundError("dependency");
}

export async function getTaskChoices(ctx: WorkspaceContext) {
  assertCan(ctx, "records:view");
  return listTaskChoices(ctx);
}

// --- Warranties ------------------------------------------------------------

export type WarrantyInput = FormInput<typeof warrantyInput>;

export async function getWarranties(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string; roomId?: string; materialId?: string },
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
  if (!created) throw new NotFoundError("contractor, project, room or material");
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
