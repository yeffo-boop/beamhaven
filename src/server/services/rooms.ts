import "server-only";

import type { MeasurementSystem } from "@/lib/units";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import { findProperty } from "@/server/data/properties";
import {
  deleteOpeningRow,
  deleteRoomRow,
  findRoom,
  insertOpening,
  insertRoom,
  listRooms,
  type RoomDetail,
  type RoomFields,
  type RoomSummary,
  updateRoomRow,
} from "@/server/data/rooms";
import { getMeasurementSystem } from "@/server/data/workspaces";

import { removeFiles } from "./attachments";
import { NotFoundError } from "./errors";
import { type FormInput, openingInput, roomInput } from "./inputs";

export type RoomInput = FormInput<ReturnType<typeof roomInput>>;
export type OpeningInput = FormInput<ReturnType<typeof openingInput>>;

export async function getRooms(ctx: WorkspaceContext): Promise<RoomSummary[]> {
  assertCan(ctx, "records:view");
  return listRooms(ctx);
}

export async function getRoom(ctx: WorkspaceContext, id: string): Promise<RoomDetail> {
  assertCan(ctx, "records:view");
  const room = await findRoom(ctx, id);
  if (!room) throw new NotFoundError("room");
  return room;
}

/** Validates room input into stored fields (lengths in mm, plus the unit typed). */
async function toRoomFields(
  ctx: WorkspaceContext,
  input: RoomInput,
): Promise<{ propertyId: string; fields: RoomFields }> {
  const system = await getMeasurementSystem(ctx);
  const { propertyId, length, width, ceilingHeight, ...rest } = roomInput(system).parse(input);
  const typed = [length, width, ceilingHeight].find((v) => v !== null);
  return {
    propertyId,
    fields: {
      ...rest,
      lengthMm: length?.mm ?? null,
      widthMm: width?.mm ?? null,
      ceilingHeightMm: ceilingHeight?.mm ?? null,
      enteredUnit: typed?.unit ?? system,
    },
  };
}

export async function createRoom(ctx: WorkspaceContext, input: RoomInput): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { propertyId, fields } = await toRoomFields(ctx, input);
  if (!(await findProperty(ctx, propertyId))) throw new NotFoundError("property");
  const { id } = await insertRoom(ctx, propertyId, fields);
  await recordActivity(ctx, {
    action: "room.created",
    entityType: "room",
    entityId: id,
    summary: `Added the room “${fields.name}”`,
  });
  return { id };
}

export async function updateRoom(
  ctx: WorkspaceContext,
  id: string,
  input: RoomInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const before = await findRoom(ctx, id);
  if (!before) throw new NotFoundError("room");
  // A room stays on its property.
  const { fields } = await toRoomFields(ctx, { ...input, propertyId: before.propertyId });
  if (!(await updateRoomRow(ctx, id, fields))) throw new NotFoundError("room");
  await recordActivity(ctx, {
    action: "room.updated",
    entityType: "room",
    entityId: id,
    summary: "Updated the room details",
  });
}

export async function deleteRoom(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const { deleted, fileIds } = await deleteRoomRow(ctx, id);
  if (!deleted) throw new NotFoundError("room");
  await removeFiles(ctx, fileIds);
}

export async function addOpening(
  ctx: WorkspaceContext,
  roomId: string,
  input: OpeningInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const system: MeasurementSystem = await getMeasurementSystem(ctx);
  const { width, height, sillHeight, ...rest } = openingInput(system).parse(input);
  // requiredLength() guarantees these are set; the check satisfies TypeScript.
  if (!width || !height) throw new Error("unreachable: width and height are required");
  const created = await insertOpening(ctx, roomId, {
    ...rest,
    widthMm: width.mm,
    heightMm: height.mm,
    sillHeightMm: sillHeight?.mm ?? null,
    enteredUnit: width.unit,
  });
  if (!created) throw new NotFoundError("room");
  await recordActivity(ctx, {
    action: "room.opening_added",
    entityType: "room",
    entityId: roomId,
    summary: `Added a ${rest.kind}${rest.label ? ` (${rest.label})` : ""}`,
  });
  return created;
}

export async function removeOpening(
  ctx: WorkspaceContext,
  roomId: string,
  openingId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await deleteOpeningRow(ctx, roomId, openingId))) throw new NotFoundError("opening");
  await recordActivity(ctx, {
    action: "room.opening_removed",
    entityType: "room",
    entityId: roomId,
    summary: "Removed a window or door",
  });
}
