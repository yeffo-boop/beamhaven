import "server-only";

import type { z } from "zod";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  deleteProjectRow,
  findProject,
  insertProject,
  listProjects,
  type ProjectDetail,
  type ProjectSummary,
  setProjectRooms,
  updateProjectRow,
} from "@/server/data/projects";
import { findProperty } from "@/server/data/properties";

import { removeFiles } from "./attachments";
import { NotFoundError } from "./errors";
import {
  type FormInput,
  projectInput,
  projectRoomsInput,
  type ProjectStatus,
  STATUS_LABELS,
} from "./inputs";

export type ProjectInput = FormInput<typeof projectInput>;

export async function getProjects(ctx: WorkspaceContext): Promise<ProjectSummary[]> {
  assertCan(ctx, "records:view");
  return listProjects(ctx);
}

export async function getProject(ctx: WorkspaceContext, id: string): Promise<ProjectDetail> {
  assertCan(ctx, "records:view");
  const project = await findProject(ctx, id);
  if (!project) throw new NotFoundError("project");
  return project;
}

export async function createProject(
  ctx: WorkspaceContext,
  input: ProjectInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { propertyId, ...fields } = projectInput.parse(input);
  if (!(await findProperty(ctx, propertyId))) throw new NotFoundError("property");
  const { id } = await insertProject(ctx, propertyId, fields);
  await recordActivity(ctx, {
    action: "project.created",
    entityType: "project",
    entityId: id,
    summary: `Created the project “${fields.name}”`,
  });
  return { id };
}

export async function updateProject(
  ctx: WorkspaceContext,
  id: string,
  input: ProjectInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const before = await findProject(ctx, id);
  if (!before) throw new NotFoundError("project");
  // A project stays on its property; the property field is only used when creating.
  const { name, description, status, plannedStart, plannedEnd, actualStart, actualEnd } =
    projectInput.parse({ ...input, propertyId: before.propertyId });
  const fields = { name, description, status, plannedStart, plannedEnd, actualStart, actualEnd };
  if (!(await updateProjectRow(ctx, id, fields))) throw new NotFoundError("project");
  const statusChanged = before.status !== fields.status;
  await recordActivity(ctx, {
    action: statusChanged ? "project.status_changed" : "project.updated",
    entityType: "project",
    entityId: id,
    summary: statusChanged
      ? `Changed the status from ${STATUS_LABELS[before.status as ProjectStatus] ?? before.status} to ${STATUS_LABELS[fields.status]}`
      : "Updated the project details",
  });
}

export async function deleteProject(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const { deleted, fileIds } = await deleteProjectRow(ctx, id);
  if (!deleted) throw new NotFoundError("project");
  await removeFiles(ctx, fileIds);
}

/** Replaces the set of rooms this project works on. */
export async function linkProjectRooms(
  ctx: WorkspaceContext,
  projectId: string,
  input: z.input<typeof projectRoomsInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const links = projectRoomsInput.parse(input);
  if (!(await setProjectRooms(ctx, projectId, links))) throw new NotFoundError("project");
  await recordActivity(ctx, {
    action: "project.rooms_changed",
    entityType: "project",
    entityId: projectId,
    summary:
      links.length === 1
        ? "Updated the room for this project"
        : `Updated the rooms (${links.length})`,
  });
}
